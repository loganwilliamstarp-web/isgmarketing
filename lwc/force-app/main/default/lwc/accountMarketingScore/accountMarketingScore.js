import { LightningElement, api } from 'lwc';
import currentUserId from '@salesforce/user/Id';

export default class AccountMarketingScore extends LightningElement {
    @api recordId;
    @api baseUrl = 'https://isgmarketing-production.up.railway.app';

    userId = currentUserId;
    iframeLoaded = false;

    get iframeUrl() {
        if (!this.userId || !this.recordId) return '';
        return `${this.baseUrl}/${this.userId}/embed/score/${this.recordId}`;
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
