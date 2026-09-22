declare module "oauth-1.0a" {
  type Token = { key: string; secret: string };
  type RequestData = { url: string; method: string; data?: Record<string, string> };

  export default class OAuth {
    constructor(options: {
      consumer: Token;
      signature_method: string;
      hash_function: (baseString: string, key: string) => string;
    });
    authorize(request: RequestData, token?: Token): Record<string, string>;
    toHeader(authorization: Record<string, string>): { Authorization: string };
  }
}
