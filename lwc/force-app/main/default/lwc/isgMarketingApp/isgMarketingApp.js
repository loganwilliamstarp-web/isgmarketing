import { LightningElement, api } from 'lwc';
import currentUserId from '@salesforce/user/Id';

export default class IsgMarketingApp extends LightningElement {
    @api baseUrl = 'https://isgmarketing-production.up.railway.app';

    userId = currentUserId;
    iframeLoaded = false;
    iframeHeight = '800px';

    get iframeUrl() {
        if (!this.userId) return '';
        return `${this.baseUrl}/${this.userId}/dashboard`;
    }

    get showLoading() {
        return !this.iframeLoaded && this.iframeUrl;
    }

    get hasConfig() {
        return !!this.userId;
    }

    get containerStyle() {
        return `width:100%;height:${this.iframeHeight};overflow:hidden;`;
    }

    handleIframeLoad() {
        this.iframeLoaded = true;
    }

    connectedCallback() {
        this._messageHandler = (event) => {
            if (event.data && event.data.type === 'isg-iframe-resize') {
                this.iframeHeight = `${event.data.height}px`;
            }
        };
        window.addEventListener('message', this._messageHandler);
    }

    disconnectedCallback() {
        if (this._messageHandler) {
            window.removeEventListener('message', this._messageHandler);
        }
    }
}
