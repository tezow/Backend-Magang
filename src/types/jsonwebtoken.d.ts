declare module "jsonwebtoken" {
    export function sign(payload: string | object | Buffer, secretOrPrivateKey: string, options?: { expiresIn?: string | number }): string;
    export function verify(token: string, secretOrPublicKey: string): string | object;
}