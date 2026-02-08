import { LightningElement, api } from 'lwc';

export default class AccountEmailActivity extends LightningElement {
    @api recordId;
    @api userId;
    @api baseUrl = 'https://isgmarketing-production.up.railway.app';

    iframeLoaded = false;

    get iframeUrl() {
        if (!this.userId || !this.recordId) return '';
        return `${this.baseUrl}/${this.userId}/embed/email-activity/${this.recordId}`;
    }

    get showLoading() {
        return !this.iframeLoaded && this.iframeUrl;
    }

    get hasConfig() {
        return !!this.userId;
    }

    handleIframeLoad() {
        this.iframeLoaded = true;
    }
}
