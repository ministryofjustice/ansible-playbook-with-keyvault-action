import util = require("util");
import * as core from '@actions/core';

export class KeyVaultActionParameters {

    public keyVaultName: string;
    public secretsFilter: string[];
    public keyVaultUrl: string;
    public secrets: object;

    public getKeyVaultActionParameters(keyVaultName: string, secretsFilter: string[]) : KeyVaultActionParameters {
        this.keyVaultName = keyVaultName;
        this.secretsFilter = secretsFilter;
        this.secrets = new Object();

        if (!this.keyVaultName) {
            core.setFailed("Vault name not provided.");
        }

        if (!this.secretsFilter) {
            core.setFailed("No secrets provided.");
        }

        const azureKeyVaultDnsSuffix = "vault.azure.net";
        this.keyVaultUrl = util.format("https://%s.%s", this.keyVaultName, azureKeyVaultDnsSuffix);
        return this;
    }

    public setSecret(name: string, secret: string): void {
        core.debug("Retrieved secret: " + name);
        this.secrets[name] = secret;
    }

}
