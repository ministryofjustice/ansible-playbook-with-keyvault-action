import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as fs from 'fs';
import { getHandler } from 'azure-actions-webclient/lib/AuthorizationHandlerFactory';
import { KeyVaultActionParameters } from './KeyVaultActionParameters';
import { KeyVaultHelper } from './KeyVaultHelper';
import { FormatType, SecretParser } from 'actions-secret-parser';

async function main() {

    const cleanupFiles = [];
    let errorMessage = "Failed to initialise";
    let startingDir = "";
    let doCleanup = true;
    let doAnsible = true;

    try {
        errorMessage = "Failed to parse action inputs";
        const ansibleCmdlineOptions = [];
        const keyVaultSecrets = [];
        let keyVaultParams = null;
        let hideCliOutput = true;
        let hideAnsibleOutput = false;

        // parse inputs
        core.debug("Parsing inputs");
        errorMessage = "Failed to parse action inputs";
        const azureCredsGithubSecret = core.getInput('azure_creds');
        const keyVaultName = core.getInput("keyvault_name");
        const sshPasswordSecretName = core.getInput("keyvault_secret_name_ssh_password");
        const vaultPasswordSecretName = core.getInput("keyvault_secret_name_vault_password");
        const sshPrivateKeySecretName = core.getInput("keyvault_secret_name_ssh_privkey");
        const sshPasswordTxtFilename = core.getInput("ssh_password_txt_filename");
        const sshPrivateKeyFilename = core.getInput("ssh_privkey_filename");
        const vaultPasswordFilename = core.getInput("vault_password_filename");
        const extraVarsYamlFilename = core.getInput("extra_vars_yaml_filename");
        const ansibleRepoPath = core.getInput("ansible_dir");
        const ansiblePlaybook = core.getInput("ansible_playbook", { required: true });
        const ansibleInventory = core.getInput("ansible_inventory");
        const ansibleLimit = core.getInput("ansible_limit");
        const ansibleUser = core.getInput("ansible_user");
        const ansibleVars = core.getInput("ansible_vars");
        const ansibleArgs = core.getInput("ansible_args");
        const ansibleConfig = core.getInput("ansible_config");
        const actionSettings = core.getInput("action_settings");

        // setup key vault parameters
        if (sshPasswordSecretName) keyVaultSecrets.push(sshPasswordSecretName);
        if (vaultPasswordSecretName) keyVaultSecrets.push(vaultPasswordSecretName);
        if (sshPrivateKeySecretName) keyVaultSecrets.push(sshPrivateKeySecretName);

        // parse actionSettings
        if (actionSettings.search("showCliOutput") != -1) hideCliOutput = false;
        if (actionSettings.search("hideAnsibleOutput") != -1) hideAnsibleOutput = true;
        if (actionSettings.search("noCleanup") != -1) doCleanup = false;
        if (actionSettings.search("noAnsible") != -1) doAnsible = false;
        core.debug(`ActionSettings: hideCliOutput=${hideCliOutput}; hideAnsibleOutput=${hideAnsibleOutput}; doCleanup=${doCleanup}; doAnsible=${doAnsible}`);

        // Change directory to ansible repo directory
        core.debug("Changing to ansible_dir directory");
        errorMessage = "Failed to change directory to ansible_dir";
        startingDir = process.cwd();
        process.chdir(ansibleRepoPath);

        // Check ansible command exists before we get into the nitty gritty
        core.debug("Checking ansible-playbook exists");
        errorMessage = "Failed to execute ansible-playbook --version, is ansible-playbook installed?";
        const ansiblePlaybookPath = await io.which("ansible-playbook", true);
        await executeCliCommand(ansiblePlaybookPath, "--version", hideCliOutput);
        
        // Login to azure if credentials are set
        if (azureCredsGithubSecret) {
            // Parse credentials
            core.debug("Parsing azure credentials");
            errorMessage = "Failed to parse azure credentials";
            const azureCreds = new SecretParser(azureCredsGithubSecret, FormatType.JSON);
            const servicePrincipalId = azureCreds.getSecret("$.clientId", false);
            const servicePrincipalKey = azureCreds.getSecret("$.clientSecret", true);
            const tenantId = azureCreds.getSecret("$.tenantId", false);
            const subscriptionId = azureCreds.getSecret("$.subscriptionId", false);
            if (!servicePrincipalId || !servicePrincipalKey || !tenantId || !subscriptionId) {
                throw new Error("Not all values are present in azure_creds input. Ensure clientId, clientSecret, tenantId and subscriptionId are supplied.");
            }

            // Check az command exists
            core.debug("Checking az command exists");
            errorMessage = "Failed to execute az --version";
            const azPath = await io.which("az", true);
            await executeCliCommand(azPath, "--version", hideCliOutput);

            // Attempting Az cli login
            core.debug("Executing az login");
            errorMessage = "Failed to az login";
            await executeCliCommand(azPath, `login --service-principal -u "${servicePrincipalId}" -p "${servicePrincipalKey}" --tenant "${tenantId}"`, hideCliOutput);
            errorMessage = "Failed to az account set";
            await executeCliCommand(azPath, `account set --subscription "${subscriptionId}"`, hideCliOutput);
        }

        // Retrieve required secrets from KeyVault
        if (keyVaultSecrets) {
            core.debug("Retrieving credentials from Azure KeyVault");
            errorMessage = "Failed to retrieve KeyVault secrets";
            keyVaultParams = new KeyVaultActionParameters().getKeyVaultActionParameters(keyVaultName, keyVaultSecrets);
            const handler = await getHandler();
            if (handler == null) {
                throw new Error("Unable to create credential handler for retrieving keyvault secrets");
            }
            const keyVaultHelper = new KeyVaultHelper(handler, 100, keyVaultParams);
            await keyVaultHelper.downloadSecrets();
        }

        // Create temporary txt files containing vault password
        if (vaultPasswordSecretName) {
            core.debug(`Creating temporary file for vault password`);
            errorMessage = "Failed to create temporary file for vault password";
            const vaultPassword = keyVaultParams.secrets[vaultPasswordSecretName];
            if (!vaultPassword || !vaultPasswordFilename) {
                throw new Error("Unable to retrieve ansible vault password from KeyVault, or value is empty, or filename not set");
            }
            fs.writeFileSync(vaultPasswordFilename, vaultPassword, { mode: 0o600 });
            cleanupFiles.push(vaultPasswordFilename);
        }

        // Create temporary txt files containing ssh private key
        if (sshPrivateKeySecretName) {
            core.debug(`Creating temporary file for ssh private key`);
            errorMessage = "Failed to create temporary file for ssh private key";
            const sshPrivateKeyBase64 = keyVaultParams.secrets[sshPrivateKeySecretName];
            const sshPrivateKey = Buffer.from(sshPrivateKeyBase64, 'base64').toString();
            if (!sshPrivateKey || !sshPrivateKeyFilename) {
                throw new Error("Unable to retrieve ssh private key from KeyVault, value is empty, or couldn't base64 decode, or filename not set");
            }
            fs.writeFileSync(sshPrivateKeyFilename, sshPrivateKey, { mode: 0o600 });
            cleanupFiles.push(sshPrivateKeyFilename);
        }

        // Create temporary txt file containing password (e.g. if sshpass manually configured)
        if (sshPasswordTxtFilename) {
            core.debug(`Creating temporary text file ssh password`);
            errorMessage = "Failed to create temporary text file for ssh password";
            const sshPassword = keyVaultParams.secrets[sshPasswordSecretName];
            if (!sshPassword) {
                throw new Error("Unable to retrieve ssh password from KeyVault, or value is empty");
            }
            fs.writeFileSync(sshPasswordTxtFilename, sshPassword, { mode: 0o600 });
            cleanupFiles.push(sshPasswordTxtFilename);
        }

        // Form ansible-playbook commandline
        core.debug("Setting up ansible options");
        errorMessage = "Failed to setup ansible options";
        ansibleCmdlineOptions.push(ansiblePlaybook);
        if (ansibleInventory) ansibleCmdlineOptions.push(`-i ${ansibleInventory}`);
        if (ansibleLimit) ansibleCmdlineOptions.push(`--limit ${ansibleLimit}`);

        // Add additional yaml for extra-vars
        if (ansibleVars) {
            const extraVarsYaml = [];
            const extraVars = ansibleVars.trim().split("|");
            extraVars.forEach(extraVar => {
                const equalPos=extraVar.search("=");
                if (equalPos != -1) {
                    const field=extraVar.substr(0, equalPos);
                    const val=extraVar.substr(equalPos+1);
                    extraVarsYaml.push(`${field}: '${val}'`);
                } else {
                    if (extraVar == "remote_user" || extraVar == "ansible_user") {
                        if (!ansibleUser) {
                            throw new Error(`ansible_vars includes ${extraVar}, but ansible_user input not specified`);
                        }
                        extraVarsYaml.push(`${extraVar}: '${ansibleUser}'`);
                    } else if (extraVar == "ansible_password" || extraVar == "ansible_ssh_pass") {
                        const sshPassword = keyVaultParams.secrets[sshPasswordSecretName];
                        if (!sshPassword) {
                            throw new Error(`ansible_vars includes ${extraVar}, but ssh password keyvault inputs not specified`);
                        }
                        extraVarsYaml.push(`${extraVar}: '${sshPassword}'`);
                    } else if (extraVar == "vault_password_file") {
                        if (!vaultPasswordFilename) {
                            throw new Error(`ansible_vars includes ${extraVar}, but vault_password_filename input not specified`);
                        }
                        extraVarsYaml.push(`${extraVar}: '${vaultPasswordFilename}'`);
                    } else {
                        throw new Error(`ansible_vars includes ${extraVar}.  Unable to automatically assign a value to this`);
                    }
                }
            });
            fs.writeFileSync(extraVarsYamlFilename, extraVarsYaml.join("\n") + "\n", { mode: 0o600 });
            cleanupFiles.push(extraVarsYamlFilename);
            ansibleCmdlineOptions.push(`-e @${extraVarsYamlFilename}`);
        }

        if (ansibleArgs) {
            const args = ansibleArgs.trim().split("|");
            args.forEach(untrimmedArg => {
                const arg=untrimmedArg.trim();
                if (arg.search(" ") != -1) {
                    ansibleCmdlineOptions.push(arg);
                } else {
                    if (arg == "-u" || arg == "--user") {
                        if (!ansibleUser) {
                            throw new Error(`${arg} option specified in ansible_args without ansible_user being set`);
                        }
                        ansibleCmdlineOptions.push(`${arg} ${ansibleUser}`);
                    } else if (arg == "--key-file" || arg == "--private-key") {
                        if (!sshPrivateKeyFilename) {
                            throw new Error(`${arg} option specified in ansible_args without ssh_privkey_filename being set`);
                        }
                        ansibleCmdlineOptions.push(`${arg} ${sshPrivateKeyFilename}`);
                    } else if (arg == "-i" || arg == "--inventory" || arg == "--inventory-file") {
                        throw new Error(`${arg} option not allowed in ansible_args.  It's added automatically if ansible_inventory is set`);
                    } else if (arg == "--vault-password-file" || arg == "--vault-pass-file") {
                        if (!vaultPasswordFilename) {
                            throw new Error(`${arg} option specified in ansible_args without vault_password_filename being set`);
                        }
                        ansibleCmdlineOptions.push(`${arg} ${vaultPasswordFilename}`);
                    } else {
                        ansibleCmdlineOptions.push(arg);
                    }
                } 
            });
        }

        if (ansibleConfig) {
            core.exportVariable('ANSIBLE_CONFIG', `${ansibleRepoPath}/${ansibleConfig}`);
        }

        // Run ansible
        core.debug("Executing ansible-playbook");
        errorMessage = "Failed to execute ansible"; 
        console.log(ansibleCmdlineOptions.join(" "));
        if (doAnsible) {
            await executeCliCommand(ansiblePlaybookPath, ansibleCmdlineOptions.join(" "), hideAnsibleOutput);
        } else {
            console.log("Not executing: ansible-playbook " + ansibleCmdlineOptions.join(" "));
        }
    } catch (error) {
        core.debug("Error message: " + error);
        core.setFailed(errorMessage);
    } finally {
        if (doCleanup) cleanup(cleanupFiles, startingDir);
    }
}

async function executeCliCommand(cmd: string, args: string, silent?: boolean) {
    try {
        await exec.exec(`"${cmd}" ${args}`, [],  {silent: !!silent});
    }
    catch(error) {
        throw new Error(error);
    }
}

function cleanup(cleanupFiles: string[], startingDir: string) {
    try {
        // Tidy up any temporary credential files
        cleanupFiles.forEach((cleanupFile) => {
            core.debug("cleanup: removing temporary file: " + cleanupFile);
            fs.unlinkSync(cleanupFile);
        });
        // Change back to original directory
        if (startingDir) {
            core.debug("cleanup: changing back to original directory");
            process.chdir(startingDir);
        }
    }
    catch(error) {
        core.error("Cleanup failed with error: " + error);
    }
}

main();
