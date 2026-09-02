export class DisabledGoogleOAuth {
    fail() { throw new Error('Live Google OAuth is not configured'); }
    async exchangeCode(_input) { return this.fail(); }
    async refresh(_token) { return this.fail(); }
    async revoke(_token) { return this.fail(); }
}
