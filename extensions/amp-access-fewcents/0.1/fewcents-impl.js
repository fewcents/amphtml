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

import {removeChildren} from '#core/dom';
import {dict} from '#core/types/object';

import {Services} from '#service';

import {listen} from '#utils/event-helper';
import {user} from '#utils/log';

import {CSS} from '../../../build/amp-access-fewcents-0.1.css';
import {installStylesForDoc} from '../../../src/style-installer';
import {parseUrlDeprecated} from '../../../src/url';

const TAG = 'amp-access-fewcents';

const TAG_SHORTHAND = 'aaf';

const AUTHORIZATION_TIMEOUT = 3000;

const CONFIG_BASE_PATH = 'https://api.hounds.fewcents.co/v1/amp/authorizeBid?';

const CONFIG_REQ_PARAMS =
  'articleUrl=SOURCE_URL&ampReaderId=READER_ID&returnUrl=RETURN_URL';

const DEFAULT_MESSAGES = {
  fcTitleText: 'Instant Access With Fewcents.',
  fcFlashText: 'Thank you for the payment!',
  fcPromptText: 'I already bought this',
  fcButtonText: 'Unlock',
  fcPoweredImageRef:
    'https://dev.fewcents.co/static/media/powered-fewcents.5c8ee304.png',
  fcImageRef: 'https://dev.fewcents.co/static/media/logo.0fa2844b.png',
  fcFlashRefImage:
    '	https://dev.fewcents.co/static/media/artwork-unlocked-lg.27cdaf0e.svg',
  fcFlashHorizontalImage:
    '	https://dev.fewcents.co/static/media/artwork-unlocked-sm.ec9b10de.svg',
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

    /** @private {?Node} */
    this.dialogContainer_ = null;

    /** @private {string} */
    this.fewCentsBidId_ = null;

    /** @private {JsonObject} */
    this.purchaseOptions_ = null;

    /** @private {string} */
    this.loginDialogUrl_ = null;

    /** @private {?Function} */
    this.unlockButtonListener_ = null;

    /** @private {?Function} */
    this.alreadyPurchasedListener_ = null;

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
    return this.getPaywallData_()
      .then(
        (response) => {
          // removing the paywall if shown and showing the content
          this.emptyContainer_().then(() => {
            this.renderFlash_();

            //removing the flash message after 3 sec
            setTimeout(() => {
              this.emptyContainer_();
            }, 3000);
          });

          return {access: response.data.access, flash: true};
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
            .catch(() => {
              throw err;
            })
            .then((responseJson) => {
              this.parseAuthorizeResponse_(responseJson);
              this.emptyContainer_().then(
                this.renderPurchaseOverlay_.bind(this)
              );
              return {access: false};
            });
        }
      )
      .catch(() => {
        // showing the content when authorize endpoint fails
        this.emptyContainer_();
        return {access: true};
      });
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
    const purchaseOptionsList = response?.data?.purchaseOptions;
    this.purchaseOptions_ = purchaseOptionsList?.[0];
    this.loginDialogUrl_ = response?.data?.loginUrl;
    const fewCentsBidId = response?.data?.bidId;

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

    if (this.unlockButtonListener_) {
      this.unlockButtonListener_ = null;
    }

    if (this.alreadyPurchasedListener_) {
      this.alreadyPurchasedListener_ = null;
    }

    return this.vsync_.mutatePromise(() => {
      this.containerEmpty_ = true;
      this.innerContainer_ = null;
      removeChildren(this.getPaywallContainer_());
    });
  }

  /**
   * Renders success success flash image in the paywall component
   * @private
   */
  renderFlash_() {
    this.innerContainer_ = this.createElement_('div');
    this.innerContainer_.className = TAG_SHORTHAND + '-flash-container';

    const imageDiv = this.createElement_('div');
    imageDiv.className = TAG_SHORTHAND + '-flash-image-div';
    imageDiv.appendChild(
      this.createImageTag_(
        'img',
        this.i18n_['fcFlashRefImage'],
        '-hor-flash-image'
      )
    );

    imageDiv.appendChild(
      this.createImageTag_(
        'img',
        this.i18n_['fcFlashHorizontalImage'],
        '-flash-image'
      )
    );

    imageDiv.appendChild(this.createFlashText_());
    this.innerContainer_.appendChild(imageDiv);
    this.dialogContainer_.appendChild(this.innerContainer_);
    this.containerEmpty_ = false;
  }

  /**
   * Creates text and fc logo on the flash image
   * @private
   */
  createFlashText_() {
    const flashTextDiv = this.createElement_('div');
    flashTextDiv.className = TAG_SHORTHAND + '-flash-text-div';

    const flashText = this.createAndAddProperty_(
      'h2',
      this.i18n_['fcFlashText'],
      '-flash-text'
    );

    flashTextDiv.appendChild(flashText);
    flashTextDiv.appendChild(
      this.createImageTag_(
        'img',
        this.i18n_['fcImageRef'],
        '-flash-fewcents-image-tag'
      )
    );
    return flashTextDiv;
  }

  /**
   * Creates the paywall component
   * @private
   */
  renderPurchaseOverlay_() {
    this.dialogContainer_ = this.getPaywallContainer_();
    this.innerContainer_ = this.createElement_('div');
    this.innerContainer_.className = TAG_SHORTHAND + '-container';

    // image element for the publisher logo
    const publisherLogo = this.createImageTag_(
      'img',
      this.fewcentsConfig_['publisherLogoUrl'],
      '-imageTag'
    );

    this.innerContainer_.appendChild(publisherLogo);

    // div element for the header text
    const headerText = this.createAndAddProperty_(
      'div',
      this.i18n_['fcTitleText'],
      '-headerText'
    );

    this.innerContainer_.appendChild(headerText);

    // anchor element for prompt text
    const alreadyBought = this.createAnchorElement_(
      this.i18n_['fcPromptText'],
      this.loginDialogUrl_,
      '-already-bought'
    );

    this.alreadyPurchasedListener_ = listen(alreadyBought, 'click', (ev) => {
      this.handlePurchase_(ev);
    });

    this.innerContainer_.appendChild(alreadyBought);

    // article price and unlock button div element
    const priceAndButtonDiv = this.createElement_('div');
    priceAndButtonDiv.className = TAG_SHORTHAND + '-price-btn-div';
    this.innerContainer_.appendChild(priceAndButtonDiv);

    // article price element
    const price = this.createAndAddProperty_(
      'div',
      this.purchaseOptions_?.price?.price,
      '-article-price'
    );

    priceAndButtonDiv.appendChild(price);

    // unlock button div element
    const buttonDiv = this.createAndAddProperty_('div', null, '-btn-div');

    // unlock button element
    const unlockButton = this.createElement_('button');
    unlockButton.className = TAG_SHORTHAND + '-purchase-button';
    unlockButton.textContent = this.i18n_['fcButtonText'];
    this.unlockButtonListener_ = listen(unlockButton, 'click', (ev) => {
      this.handlePurchase_(ev);
    });

    buttonDiv.appendChild(unlockButton);
    priceAndButtonDiv.appendChild(buttonDiv);

    // div element for reference row and fewcents logo
    const bottomDiv = this.createAndAddProperty_('div', null, '-bottom-div');

    // reference row for terms and conditions
    const refRow = this.createRefRowElement_();
    bottomDiv.appendChild(refRow);

    // publisher logo
    const fewcentsLogo = this.createImageTag_(
      'img',
      this.i18n_['fcPoweredImageRef'],
      '-fewcents-image-tag'
    );
    bottomDiv.appendChild(fewcentsLogo);
    this.innerContainer_.appendChild(bottomDiv);

    this.dialogContainer_.appendChild(this.innerContainer_);
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
      this.createAnchorElement_(
        'Terms',
        this.i18n_['fcTermsRef'],
        '-refElements'
      )
    );

    this.createPartitionbar_(refRow);

    refRow.appendChild(
      this.createAnchorElement_(
        'Privacy',
        this.i18n_['fcPrivacyRef'],
        '-refElements'
      )
    );

    this.createPartitionbar_(refRow);

    refRow.appendChild(
      this.createAnchorElement_(
        'Contact Us',
        this.i18n_['fcContactUsRef'],
        '-refElements'
      )
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
  createAnchorElement_(text, href, className) {
    const element = this.createElement_('a');
    element.className = TAG_SHORTHAND + className;
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
