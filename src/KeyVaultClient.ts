import * as core from '@actions/core';
import { IAuthorizationHandler } from "azure-actions-webclient/lib/AuthHandler/IAuthorizationHandler";
import { ApiResult, ServiceClient, ApiCallback, ToError } from "azure-actions-webclient/lib/AzureRestClient";
import { WebRequest, WebResponse } from "azure-actions-webclient/lib/webClient";

export class KeyVaultClient extends ServiceClient {
    private keyVaultUrl: string;
    private apiVersion = "7.0";
    private tokenArgs: string[] = ["--resource", "https://vault.azure.net"];

    constructor(endpoint: IAuthorizationHandler, timeOut: number, keyVaultUrl: string) {
        super(endpoint, timeOut);
        this.keyVaultUrl = keyVaultUrl;
    }

    public async invokeRequest(request: WebRequest): Promise<WebResponse> {
        return this.beginRequest(request, this.tokenArgs);
    }

    public getSecretValue(secretName: string, callback: ApiCallback) {
        if (!callback) {
            core.debug("Callback Cannot Be Null");
            throw new Error("Callback Cannot Be Null");
        }

        // Create HTTP transport objects
        const httpRequest: WebRequest = {
            method: 'GET',
            headers: {},
            uri: this.getRequestUriForbaseUrl(
                this.keyVaultUrl,
                '/secrets/{secretName}',
                {
                    '{secretName}': secretName
                },
                [],
                this.apiVersion
            )
        };

        this.invokeRequest(httpRequest).then(async (response: WebResponse) => {
            if (response.statusCode == 200) {
                return new ApiResult(null, response.body.value);
            }
            else if (response.statusCode == 400) {
                return new ApiResult('Get Secret Failed Because Of Invalid Characters', secretName);
            }
            else {
                return new ApiResult(ToError(response));
            }
        }).then((apiResult: ApiResult) => callback(apiResult.error, apiResult.result),
            (error) => callback(error));
    }
}
