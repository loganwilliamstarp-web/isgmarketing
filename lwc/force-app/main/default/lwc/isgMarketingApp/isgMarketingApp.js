import { LightningElement, api } from 'lwc';
import currentUserId from '@salesforce/user/Id';

export default class IsgMarketingApp extends LightningElement {
    @api baseUrl = 'https://isgmarketing-production.up.railway.app';

    userId = currentUserId;
    iframeLoaded = false;
    _contentHeight = 0;
    _scale = 1;
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
        // Scale the iframe so the full content fits in the available space
        // transform-origin top-left, then scale width back up so it fills horizontally
        const invScale = 1 / this._scale;
        return `width:${invScale * 100}%;height:${invScale * 100}%;transform:scale(${this._scale});transform-origin:top left;border:none;`;
    }

    handleIframeLoad() {
        this.iframeLoaded = true;
    }

    _updateLayout() {
        const container = this.template.querySelector('.iframe-container');
        if (!container) return;

        const rect = container.getBoundingClientRect();
        this._availableHeight = Math.max(window.innerHeight - rect.top, 300);

        if (this._contentHeight > 0 && this._contentHeight > this._availableHeight) {
            this._scale = this._availableHeight / this._contentHeight;
        } else {
            this._scale = 1;
        }
    }

    connectedCallback() {
        this._messageHandler = (event) => {
            if (event.data && event.data.type === 'isg-iframe-resize') {
                this._contentHeight = event.data.height;
                this._updateLayout();
            }
        };
        this._resizeHandler = () => this._updateLayout();
        window.addEventListener('message', this._messageHandler);
        window.addEventListener('resize', this._resizeHandler);
    }

    renderedCallback() {
        this._updateLayout();
    }

    disconnectedCallback() {
        if (this._messageHandler) {
            window.removeEventListener('message', this._messageHandler);
        }
        if (this._resizeHandler) {
            window.removeEventListener('resize', this._resizeHandler);
        }
    }
}
