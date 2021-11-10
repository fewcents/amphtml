/**
 * Copyright 2021 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {dict} from '#core/types/object';
import {installStylesForDoc} from '../../../src/style-installer';
import {removeChildren} from '#core/dom';

import {Services} from '#service';
import {parseUrlDeprecated} from '../../../src/url';
import {user} from '../../../src/log';

import {CSS} from '../../../build/amp-access-fewcents-0.1.css';

const TAG = 'amp-access-fewcents';

const TAG_SHORTHAND = 'aaf';

const AUTHORIZATION_TIMEOUT = 3000;

const CONFIG_BASE_PATH = 'http://localhost:3001/authorize/createLoggedOutBid?';

const CONFIG_REQ_PARAMS =
  'articleUrl=CANONICAL_URL' +
  '&ampReaderId=READER_ID' +
  '&returnUrl=RETURN_URL' +
  '&category=paywall';

const DEFAULT_MESSAGES = {
  fcTitleText: 'Instant Access With Fewcents.',
  fcPromptText: 'First 2 unlocks are free!',
  fcButtonText: 'Unlock',
  fcDefaultPrice: 'INR 50',
  fcFewcentsImageRef:
    'https://dev.fewcents.co/static/media/powered-fewcents.5c8ee304.png',
  fcPublisherImageRef:
    'https://www.jagranimages.com/images/jagran-logo-2021.png',
  fcTermsRef: 'https://www.fewcents.co/terms',
  fcPrivacyRef: 'https://www.fewcents.co/privacy',
  fcContactUsRef: 'mailto:support@fewcents.co',
};

/**
 * @implements {../../amp-access/0.1/access-vendor.AccessVendor}
 */
export class AmpAccessFewcents {
  /**
   * @param {!../../amp-access/0.1/amp-access.AccessService} accessService
   * @param {!../../amp-access/0.1/amp-access-source.AccessSource} accessSource
   */
  constructor(accessService, accessSource) {
    /** @const */
    this.ampdoc = accessService.ampdoc;

    /** @const @private {!../../amp-access/0.1/amp-access-source.AccessSource} */
    this.accessSource_ = accessSource;

    /** @private {boolean} */
    this.containerEmpty_ = true;

    /** @private {?Node} */
    this.innerContainer_ = null;

    /** @private {string} */
    this.fewCentsBidId_ = null;

    /** @private {JsonObject} */
    this.paywallSettings_ = null;

    /** @private {string} */
    this.loginDialogUrl = null;

    /** @const @private {JsonObject} */
    this.fewcentsConfig_ = this.accessSource_.getAdapterConfig();

    /** @private {string} */
    this.authorizeUrl_ = this.prepareAuthorizeUrl_();

    /** @const @private {!../../../src/service/timer-impl.Timer} */
    this.timer_ = Services.timerFor(this.ampdoc.win);

    /** @const @private {!../../../src/service/xhr-impl.Xhr} */
    this.xhr_ = Services.xhrFor(this.ampdoc.win);

    /** @const @private {!../../../src/service/vsync-impl.Vsync} */
    this.vsync_ = Services.vsyncFor(this.ampdoc.win);

    /** @private {!JsonObject} */
    this.i18n_ = /** @type {!JsonObject} */ (
      Object.assign(dict(), DEFAULT_MESSAGES, dict())
    );

    // Install styles.
    installStylesForDoc(this.ampdoc, CSS, () => {}, false, TAG);
  }

  /**
   * @return {!Promise<!JsonObject>}
   */
  authorize() {
    return this.getPaywallData_().then(
      (response) => {
        this.emptyContainer_();
        return {access: response.data.access};
      },
      (err) => {
        if (!err || !err.response) {
          throw err;
        }

        const {response} = err;
        if (response.status !== 402) {
          throw err;
        }

        return response
          .json()
          .catch(() => undefined)
          .then((responseJson) => {
            this.parseAuthorizeResponse_(responseJson);
            this.emptyContainer_().then(this.renderPurchaseOverlay_.bind(this));
            return {access: false};
          });
      }
    );
  }

  /**
   * function to add request parameters for the authorize endpoint
   * @return {string} authorize url
   * @private
   */
  prepareAuthorizeUrl_() {
    const accessKey = this.fewcentsConfig_['accessKey'];
    const articleIdentifier = this.fewcentsConfig_['articleIdentifier'];
    const {hostname} = parseUrlDeprecated();

    return (
      CONFIG_BASE_PATH +
      CONFIG_REQ_PARAMS +
      '&accessKey=' +
      accessKey +
      '&articleIdentifier=' +
      articleIdentifier +
      '&domain=' +
      hostname
    );
  }

  /**
   * function to get paywall data by making call to authorize endpoint
   * @return {!Promise<Object>}
   * @private
   */
  getPaywallData_() {
    let authorizeUrl = this.authorizeUrl_;

    if (this.fewCentsBidId_) {
      authorizeUrl = authorizeUrl + '&bidId=' + this.fewCentsBidId_;
    }

    const urlPromise = this.accessSource_.buildUrl(
      authorizeUrl,
      /* useAuthData */ false
    );

    return urlPromise
      .then((url) => {
        return this.accessSource_.getLoginUrl(url);
      })
      .then((url) => {
        return this.timer_
          .timeoutPromise(AUTHORIZATION_TIMEOUT, this.xhr_.fetchJson(url, {}))
          .then((res) => {
            return res.json();
          });
      });
  }

  /**
   * function to parse the response from authorize endpoint
   * @param {json} response
   * @private
   */
  parseAuthorizeResponse_(response) {
    this.paywallSettings_ = response?.data?.paywallSettings;
    this.loginDialogUrl = response?.data?.loginUrl;
    const fewCentsBidId = response?.data?.fewCentsBidId;

    if (fewCentsBidId) {
      this.fewCentsBidId_ = fewCentsBidId;
    }
  }

  /**
   * @param {string} name
   * @return {!Element}
   * @private
   */
  createElement_(name) {
    return this.ampdoc.win.document.createElement(name);
  }

  /**
   * @return {!Element} element where paywall will be displayed
   * @private
   */
  getPaywallContainer_() {
    const id = TAG + '-dialog';
    const dialogContainer = this.ampdoc.getElementById(id);
    return user().assertElement(
      dialogContainer,
      'No element found with id ' + id
    );
  }

  /**
   * @private
   * @return {!Promise}
   */
  emptyContainer_() {
    if (this.containerEmpty_) {
      return Promise.resolve();
    }

    return this.vsync_.mutatePromise(() => {
      this.containerEmpty_ = true;
      this.innerContainer_ = null;
      removeChildren(this.getPaywallContainer_());
    });
  }

  /**
   * @private
   */
  renderPurchaseOverlay_() {
    const dialogContainer = this.getPaywallContainer_();
    this.innerContainer_ = this.createElement_('div');
    this.innerContainer_.className = TAG_SHORTHAND + '-container';

    this.innerContainer_.appendChild(
      this.createImageTag_(
        'img',
        this.fewcentsConfig_['publisherLogoUrl'],
        '-imageTag'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_('header', this.i18n_['fcTitleText'], '-header')
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'header',
        this.i18n_['fcDefaultPrice'],
        '-article-price'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'p',
        this.i18n_['fcPromptText'],
        '-no-of-Unlock'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'button',
        this.i18n_['fcButtonText'],
        '-purchase-button'
      )
    );

    this.innerContainer_.appendChild(this.createRefRowElement_());

    this.innerContainer_.appendChild(
      this.createImageTag_('img', this.i18n_['fcFewcentsImageRef'], '-imageTag')
    );

    dialogContainer.appendChild(this.innerContainer_);
    this.containerEmpty_ = false;
  }

  /**
   * @private
   */
  createRefRowElement_() {
    const refRow = this.createElement_('div');
    refRow.className = TAG_SHORTHAND + '-refRow';
    refRow.appendChild(
      this.createAnchorElement_('Terms', this.i18n_['fcTermsRef'])
    );

    this.createPartitionbar_(refRow);

    refRow.appendChild(
      this.createAnchorElement_('Privacy', this.i18n_['fcPrivacyRef'])
    );

    this.createPartitionbar_(refRow);

    refRow.appendChild(
      this.createAnchorElement_('Contact Us', this.i18n_['fcContactUsRef'])
    );

    return refRow;
  }

  /**
   * @private
   */
  createAndAddProperty_(elementType, text, className) {
    const element = this.createElement_(elementType);
    element.className = TAG_SHORTHAND + className;
    element.textContent = text;
    return element;
  }

  /**
   * @private
   */
  createAnchorElement_(text, href) {
    const element = this.createElement_('a');
    element.className = TAG_SHORTHAND + '-refElements';
    element.href = href;
    element.target = '_blank';
    element.textContent = text;
    element.rel = 'noopener noreferrer';
    return element;
  }

  /**
   * @private
   */
  createImageTag_(elementType, imageSrc, className) {
    const element = this.createElement_(elementType);
    element.className = TAG_SHORTHAND + className;
    element.src = imageSrc;
    return element;
  }

  /**
   * @private
   */
  createPartitionbar_(refRow) {
    refRow.appendChild(
      this.createAndAddProperty_('span', '|', '-partition-bar')
    );
  }

  /**
   * @return {!Promise}
   */
  pingback() {
    return Promise.resolve();
  }
}
