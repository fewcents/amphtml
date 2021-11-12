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
import {listen} from '../../../src/event-helper';

const TAG = 'amp-access-fewcents';

const TAG_SHORTHAND = 'aaf';

const AUTHORIZATION_TIMEOUT = 3000;

const CONFIG_BASE_PATH = 'http://localhost:3001/authorize/createLoggedOutBid?';

const CONFIG_REQ_PARAMS =
  'articleUrl=CANONICAL_URL' +
  '&ampReaderId=READER_ID' +
  '&returnUrl=RETURN_URL';

const DEFAULT_MESSAGES = {
  fcFewcentsImageRef:
    'https://dev.fewcents.co/static/media/powered-fewcents.5c8ee304.png',
  fcTermsRef: 'https://www.fewcents.co/terms',
  fcPrivacyRef: 'https://www.fewcents.co/privacy',
  fcContactUsRef: 'mailto:support@fewcents.co',
};

/**
 * @implements {../../amp-access/0.1/access-vendor.AccessVendor}
 */
export class AmpAccessFewcents {
  /**
   * @constructor
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
    this.loginDialogUrl_ = null;

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
      Object.assign(dict(), DEFAULT_MESSAGES)
    );

    // Install styles.
    installStylesForDoc(this.ampdoc, CSS, () => {}, false, TAG);
  }

  /**
   * Decides whether to show the paywall or not
   * @return {!Promise<!JsonObject>}
   */
  authorize() {
    return this.getPaywallData_().then(
      (response) => {
        // removing the paywall if shown and showing the content
        this.emptyContainer_();
        return {access: response.data.access};
      },
      (err) => {
        // showing the paywall
        if (!err || !err.response) {
          throw err;
        }

        const {response} = err;
        // showing paywall when error code is 402 i.e payment required
        if (response.status !== 402) {
          throw err;
        }

        // rendering the paywall
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
   * add request parameters for the authorize endpoint
   * @return {string} authorize url
   * @private
   */
  prepareAuthorizeUrl_() {
    const accessKey = this.fewcentsConfig_['accessKey'];
    const articleIdentifier = this.fewcentsConfig_['articleIdentifier'];
    const category = this.fewcentsConfig_['category'];

    const {hostname} = parseUrlDeprecated();

    return (
      CONFIG_BASE_PATH +
      CONFIG_REQ_PARAMS +
      '&accessKey=' +
      accessKey +
      '&category=' +
      category +
      '&articleIdentifier=' +
      articleIdentifier +
      '&domain=' +
      hostname
    );
  }

  /**
   * get paywall data by making call to authorize endpoint
   * @return {!Promise<Object>}
   * @private
   */
  getPaywallData_() {
    let authorizeUrl = this.authorizeUrl_;

    // appending bidId in the authorize url during re-authorize
    if (this.fewCentsBidId_) {
      authorizeUrl = authorizeUrl + '&bidId=' + this.fewCentsBidId_;
    }

    // replacing variable READER_Id, CANONICAL_URL in the authorize url
    const urlPromise = this.accessSource_.buildUrl(
      authorizeUrl,
      /* useAuthData */ false
    );

    return urlPromise
      .then((url) => {
        // replacing variable RETURN_URL in the authorize url
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
   * parse the response from authorize endpoint
   * @param {json} response
   * @private
   */
  parseAuthorizeResponse_(response) {
    this.paywallSettings_ = response?.data?.paywallSettings;
    this.loginDialogUrl_ = response?.data?.loginUrl;
    const fewCentsBidId = response?.data?.fewCentsBidId;

    // Setting the fewcentsBidId for re-authorize
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
   * return element on publisher's page where paywall will be displayed
   * @return {!Element}
   * @private
   */
  getPaywallContainer_() {
    const id = this.fewcentsConfig_['contentSelector'];
    const dialogContainer = this.ampdoc.getElementById(id);
    return user().assertElement(
      dialogContainer,
      'No element found with id ' + id
    );
  }

  /**
   * Removes the paywall from the element on publisher's page where paywall is displayed
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
   * Creates the paywall component
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
      this.createAndAddProperty_(
        'header',
        this.paywallSettings_.fcTitleText,
        '-header'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'header',
        this.paywallSettings_.fcCustomerPrice,
        '-article-price'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'p',
        this.paywallSettings_.fcPromptText,
        '-no-of-Unlock'
      )
    );

    const unlockButton = this.createElement_('button');
    unlockButton.className = TAG_SHORTHAND + '-purchase-button';
    unlockButton.textContent = this.paywallSettings_.fcButtonText;
    this.unlockButtonListener_ = listen(unlockButton, 'click', (ev) => {
      this.handlePurchase_(ev);
    });

    this.innerContainer_.appendChild(unlockButton);

    this.innerContainer_.appendChild(this.createRefRowElement_());

    this.innerContainer_.appendChild(
      this.createImageTag_('img', this.i18n_['fcFewcentsImageRef'], '-imageTag')
    );

    dialogContainer.appendChild(this.innerContainer_);
    this.containerEmpty_ = false;
  }

  /**
   * create reference elements on paywall
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
   * create elements on paywall
   * @private
   */
  createAndAddProperty_(elementType, text, className) {
    const element = this.createElement_(elementType);
    element.className = TAG_SHORTHAND + className;
    element.textContent = text;
    return element;
  }

  /**
   * create anchor elements on the paywall
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
   * create image tag elements on the paywall
   * @private
   */
  createImageTag_(elementType, imageSrc, className) {
    const element = this.createElement_(elementType);
    element.className = TAG_SHORTHAND + className;
    element.src = imageSrc;
    return element;
  }

  /**
   * create anchor elements on the paywall
   * @private
   */
  createPartitionbar_(refRow) {
    refRow.appendChild(
      this.createAndAddProperty_('span', '|', '-partition-bar')
    );
  }

  /**
   * open login dialog when click on unlock button
   * @param {!Event} ev
   * @private
   */
  handlePurchase_(ev) {
    ev.preventDefault();
    const urlPromise = this.accessSource_.buildUrl(
      this.loginDialogUrl_,
      /* useAuthData */ false
    );

    return urlPromise.then((url) => {
      this.accessSource_.loginWithUrl(url);
    });
  }

  /**
   * @return {!Promise}
   */
  pingback() {
    return Promise.resolve();
  }
}
