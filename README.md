# ansible-playbook-with-keyvault
Github Action for deploying ansible with credentials stored in keyvault

## Build

Typescript code is under src/.  Use npm to compile into javascript + commit resulting dist/

    npm i -g @vercel/ncc
    npm install
    npm run build

The code for logging into azure and retrieving keyvault secrets is based on the following repos:

- https://github.com/Azure/login
- https://github.com/Azure/get-keyvault-secrets

### Pipelines

The github "build" pipeline verifies the build.

## Usage

### Inputs

| Variable | Description |
|----------|-------------|
| azure_creds | Optional.  If not already logged into azure, specify credentials here (same format as azure login action) |
| keyvault_name | Optional.  Name of the azure key vault containing ansible credentials |
| keyvault_secret_name_ssh_password | Optional. The name of the key vault secret that holds the ssh password |
| keyvault_secret_name_vault_password | Optional.  The name of the key vault secret that holds the ansible vault password |
| keyvault_secret_name_ssh_privkey | Optional. The name of the key vault secret that holds the ssh private key |
| ssh_password_txt_filename | Optional.  Write the ssh password to this temporary text file, e.g. if using sshpass |
| ssh_privkey_filename | Write the private key to this filename |
| vault_password_filename | The filename to write the vault password to |
| extra_vars_yaml_filename | The yaml filename to write extra variables specified in ansible_vars to |
| ansible_dir | Directory containing ansible code |
| ansible_playbook | Location of ansible playbook, e.g. site.yml |
| ansible_inventory | Optional.  Location of ansible inventory |
| ansible_limit | Optional. Limit to comma separated set of hosts or targets |
| ansible_user | Optional.  Set ansible username |
| ansible_vars | Optional.  Pipe separated list of additional vars for --extra-vars, e.g. "ansible_user|ansible_password" |
| ansible_args | Optional.  Pipe separated list of command line args, e.g. "--verbose|--check|-u|-e abc=def"' |
| ansible_config | Optional.  Location of ansible configuration file |
| action_settings | Optional.  For debug [showCliOutput,hideAnsibleOutput,noCleanup,noAnsible] |

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
      uses: TODO
      with:
        ansible_creds: '${{ secrets.AZURE_CREDENTIALS }}'
        keyvault_name: my-keyvault-name
        keyvault_secret_nane_ssh_password: 'ansible-ssh-password'
        keyvault_secret_name_vault_password: 'ansible-vault-password'
        keyvault_secret_name_ssh_privkey: 'ansible-ssh-privkey'
        ansible_dir: ${{ github.workspace }}
        ansible_playbook: sites.yml
        ansible_inventory: inventory.yml
        ansible_user: 'myuser'
        ansible_args: '--verbose|--check|-u'
        ansible_vars: 'ansible_password'
```
