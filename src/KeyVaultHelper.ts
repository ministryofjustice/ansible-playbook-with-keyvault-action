import * as core from '@actions/core';
import { IAuthorizationHandler } from "azure-actions-webclient/lib/AuthHandler/IAuthorizationHandler";
import { KeyVaultActionParameters } from "./KeyVaultActionParameters";
import { KeyVaultClient } from "./KeyVaultClient";
import util = require("util");

export class AzureKeyVaultSecret {
    name: string;
    enabled: boolean;
    expires: Date | undefined;
    contentType: string;
}

export class KeyVaultHelper {

    private keyVaultActionParameters: KeyVaultActionParameters;
    private keyVaultClient: KeyVaultClient;

    constructor(handler: IAuthorizationHandler, timeOut: number, keyVaultActionParameters: KeyVaultActionParameters) {
        this.keyVaultActionParameters = keyVaultActionParameters;
        this.keyVaultClient = new KeyVaultClient(handler, timeOut, keyVaultActionParameters.keyVaultUrl);
    }

    public downloadSecrets(): Promise<void> {
        return this.downloadSelectedSecrets();
    }

    private downloadSelectedSecrets(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            const getSecretValuePromises: Promise<any>[] = [];
            this.keyVaultActionParameters.secretsFilter.forEach((secretName: string) => {
                getSecretValuePromises.push(this.downloadSecretValue(secretName));
            });

            Promise.all(getSecretValuePromises).then(() => {
                return resolve();
            }, error => {
                return reject(new Error("Downloading selected secrets failed " + error));
            });
        });
    }

    private downloadSecretValue(secretName: string): Promise<any> {
        secretName = secretName.trim();

        return new Promise<void>((resolve, reject) => {
            this.keyVaultClient.getSecretValue(secretName, (error, secretValue) => {
                if (error) {
                    core.setFailed(util.format("Could not download the secret %s", secretName));
                }
                else {
                    this.setVaultVariable(secretName, secretValue);
                }
                
                return resolve();
            });
        });
    }

    private setVaultVariable(secretName: string, secretValue: string): void {
        if (!secretValue) {
            return;
        }

        this.keyVaultActionParameters.setSecret(secretName, secretValue);
    }

    private filterDisabledAndExpiredSecrets(listOfSecrets: AzureKeyVaultSecret[]): AzureKeyVaultSecret[] {
        const result: AzureKeyVaultSecret[] = [];
        const now: Date = new Date();

        listOfSecrets.forEach((value: AzureKeyVaultSecret) => {
            if (value.enabled && (!value.expires || value.expires > now)) {
                result.push(value);
            }
        });
        
        return result;
    }

}
