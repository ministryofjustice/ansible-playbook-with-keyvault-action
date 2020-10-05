# ansible-playbook-with-keyvault
Github Action for deploying ansible with credentials stored in Azure KeyVault

## Build

Typescript code is under src/.  Use npm to compile into javascript + commit resulting dist/

    npm install
    npm run build

The code for logging into azure and retrieving keyvault secrets is based on the following repos:

- https://github.com/Azure/login
- https://github.com/Azure/get-keyvault-secrets

### Pipelines

The github "build" pipeline verifies the build.

## Usage

Flexible action to allow execution of ansible-playbook with credentials stored in Azure KeyVault.

### Logging into Azure

If not already logged into Azure, add service principal credentials to `azure_creds` input.  Same format as used here `https://github.com/Azure/login`.
The subscription must be the same as the Azure KeyVault holding the ansible credentials.

### Ansible Vault Password

Store the ansible vault password in an Azure KeyVault:
- Set `keyvault_name` to the name of the Azure KeyVault.
- Set `keyvault_secret_name_vault_password` to the name of the secret containing the vault password.

The action will write the password to the filename set in the `vault_password_filename` option.  Then either:
- Reference this filename directly in the ansible configuration using `vault_password_file` option.
- Add using a temporary yaml file via --extra-vars cmdline option by including `vault_password_file` in the `ansible_vars` option.  The action will append the filename.
- Add via command line by including `--vault-password-file` or `--vault-pass-file` in the `ansible_args` option.  The action will append the filename.

### Ansible SSH Username

This doesn't need to be held in Azure KeyVault.  Either:
- Set the ansible username directly within the ansible configuration file.
- Set `ansible_user` option and then either:
  - Add via command line by including `-u` or `--user` to the `ansible_args` option.  The action will append the username.
  - Add using a temporary yaml file via --extra-vars cmdline option by including  `remote_user` or `ansible_user` to the `ansible_vars` option.  The action will append the username.

### Ansible SSH Private Key

Store the ansible ssh unencrypted private key in an Azure KeyVault:
- Set `keyvault_name` to the name of the Azure KeyVault.
- Set `keyvault_secret_name_ssh_privkey` to the name of the secret containing the unencrypted private key.

The action will write the key to the filename set in the `ssh_privkey_filename` option.  Then either:
- Reference this directly within the ssh_connection settings of the ansible configuration file.
- Add via command line by including `--key-file` or `--private-key` in the `ansible_args` option.  The action will append the filename.

### Ansible SSH Password

Store the ansible ssh password in an Azure KeyVault.  
- Set `keyvault_name` to the name of the Azure KeyVault.
- Set `keyvault_secret_name_ssh_password` to the name of the secret containing the ssh password.

Then:
- Store in plain text in a temporary file and reference using sshpass within the ssh_connection settings of the ansible configuration file.  The filename is set by the `ssh_password_txt_filename` option.
- Add using a temporary yaml file via --extra-vars cmdline option by including `ansible_password` or `ansible_ssh_pass` within `ansible_vars` option.  The action will append the password.


### Input Reference

| Variable | Description |
|----------|-------------|
| azure_creds | Optional.  If not already logged into azure, specify credentials here (same format as azure login action) |
| keyvault_name | Optional.  Name of the azure KeyVault containing ansible credentials |
| keyvault_secret_name_ssh_password | Optional. The name of the KeyVault secret that holds the ssh password |
| keyvault_secret_name_vault_password | Optional.  The name of the KeyVault secret that holds the ansible vault password |
| keyvault_secret_name_ssh_privkey | Optional. The name of the KeyVault secret that holds the ssh private key |
| ssh_password_txt_filename | Optional.  Write the ssh password to this temporary text file [ansible_pass] |
| ssh_privkey_filename | Optional.  Write the private key to this filename [ansible_key] |
| vault_password_filename | Optional  The filename to write the vault password to [.vault.txt] |
| extra_vars_yaml_filename | Optional.  The yaml filename to write extra variables specified in ansible_vars to [extravars.yaml] |
| ansible_dir | Directory containing ansible code |
| ansible_playbook | Location of ansible playbook, e.g. site.yml |
| ansible_inventory | Optional.  Location of ansible inventory |
| ansible_user | Optional.  Set ansible username |
| ansible_vars | Optional.  Pipe separated list of additional vars for --extra-vars, e.g. 'ansible_user\|ansible_password' |
| ansible_args | Optional.  Pipe separated list of command line args, e.g. '--verbose\|--check\|-u\|--limit testserver' |
| ansible_config | Optional.  Location of ansible configuration file |
| action_settings | Optional.  Pipe separated list of debug options, e.g. showCliOutput\|hideAnsibleOutput\|noCleanup\|noAnsible |

For `ansible_vars`, parameters will automatically get appended as necessary. for example
- `ansible_user` is added to `remote_user` or `ansible_user`
- ssh password is added to `ansible_password` or `ansible_ssh_pass`
- `vault_password_filename` is added to `vault_password_file`

For ansible_args, paramteres will automatically get appended as necessary, for example
- `ansible_user` added to `-u` or `--user`
- `ssh_privkey_filename` added to `--key-file` or `--private-key`
- `vault_password_filename` added to `--vault-password-file` or `--vault-pass-file`

### Example Pipelines

```yaml
name: sample-pipeline

on: [push]

jobs:

  check-ansible:
    runs-on: 
      - self-hosted
      - my-label
    steps:
    - name: Clone ansible repo
      uses: actions/checkout@2

    - name: Run ansible playbook
      uses: ministryofjustice/ansible-playbook-with-keyvault-action@v1.0
      with:
        ansible_creds: '${{ secrets.AZURE_CREDENTIALS }}'
        keyvault_name: my-keyvault-name
        keyvault_secret_nane_ssh_password: 'ansible-ssh-password'
        keyvault_secret_name_vault_password: 'ansible-vault-password'
        keyvault_secret_name_ssh_privkey: 'ansible-ssh-privkey'
        ssh_password_txt_filename: 'ansible_pass'
        ssh_privkey_filename: 'ansible_key'
        vault_password_filename: '.vault.txt'
        extra_vars_yaml_filename: 'extra_vars.yaml'
        ansible_dir: ${{ github.workspace }}
        ansible_playbook: sites.yml
        ansible_inventory: inventory.yml
        ansible_user: 'myuser'
        ansible_args: '--verbose|--check|-u|--limit testserver'
        ansible_vars: 'ansible_user|ansible_password'
```
