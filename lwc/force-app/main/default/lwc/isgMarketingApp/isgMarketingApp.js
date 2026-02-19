import { LightningElement, api } from 'lwc';
import currentUserId from '@salesforce/user/Id';

export default class IsgMarketingApp extends LightningElement {
    @api baseUrl = 'https://isgmarketing-production.up.railway.app';

    userId = currentUserId;
    iframeLoaded = false;
    _availableHeight = 800;

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
        return `width:100%;height:${this._availableHeight}px;overflow:hidden;`;
    }

    get iframeStyle() {
        // Let the iframe fill the container at full size — scrolling is handled inside the app
        return 'width:100%;height:100%;border:none;';
    }

    handleIframeLoad() {
        this.iframeLoaded = true;
    }

    _updateLayout() {
        const container = this.template.querySelector('.iframe-container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        this._availableHeight = Math.max(window.innerHeight - rect.top, 300);
    }

    connectedCallback() {
        this._resizeHandler = () => this._updateLayout();
        window.addEventListener('resize', this._resizeHandler);
    }

    renderedCallback() {
        this._updateLayout();
    }

    disconnectedCallback() {
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }
}
