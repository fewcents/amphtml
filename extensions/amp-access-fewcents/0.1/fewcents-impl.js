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

import {createElementWithAttributes} from '#core/dom';
import {dict} from '#core/types/object';

import {Services} from '#service';

import {user} from '#utils/log';

import {parseUrlDeprecated} from 'src/url';

import {
  AUTHORIZATION_TIMEOUT,
  CONFIG_BASE_PATH,
  DEFAULT_MESSAGES,
  TAG,
  TAG_SHORTHAND,
} from './fewcents-constants';

import {CSS} from '../../../build/amp-access-fewcents-0.1.css';
import {installStylesForDoc} from '../../../src/style-installer';

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

    /** @private {?Node} */
    this.innerContainer_ = null;

    /** @private {?Node} Main container where paywall will be rendered */
    this.dialogContainer_ = null;

    /** @const @private {JsonObject}  Stores the config passed by the publisher */
    this.fewcentsConfig_ = this.accessSource_.getAdapterConfig();

    /** @private {string} Authorize endpoint to get paywall data*/
    this.authorizeUrl_ = this.prepareAuthorizeUrl_();

    /** @private {!JsonObject} */
    this.i18n_ = Object.assign(dict(), DEFAULT_MESSAGES);

    /** @private {string} */
    this.fewCentsBidId_ = null;

    /** @const @private {!../../../src/service/xhr-impl.Xhr} */
    this.xhr_ = Services.xhrFor(this.ampdoc.win);

    /** @const @private {!../../../src/service/timer-impl.Timer} */
    this.timer_ = Services.timerFor(this.ampdoc.win);

    /** @private {JsonObject} */
    this.purchaseOptions_ = null;

    /** @private {string} */
    this.loginDialogUrl_ = null;

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
   * Add request parameters for the authorize endpoint
   * @return {string}
   * @private
   */
  prepareAuthorizeUrl_() {
    const accessKey = this.fewcentsConfig_['accessKey'];
    const articleIdentifier = this.fewcentsConfig_['articleIdentifier'];
    const category = this.fewcentsConfig_['category'];

    const {hostname} = parseUrlDeprecated();

    return (
      CONFIG_BASE_PATH +
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
   * Parse the response from authorize endpoint
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
   * Get paywall data by calling authorize endpoint
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
   * Removes the paywall from the element on publisher's page where paywall is displayed
   * @private
   * @return {!Promise}
   */
  emptyContainer_() {
    // [TODO]: Actual implementation
    return Promise.resolve();
  }

  /**
   * Return element on publisher's page where paywall will be displayed
   * @return {!Element}
   * @private
   */
  getPaywallContainer_() {
    const containerId = this.fewcentsConfig_['contentSelector'];
    const dialogContainer = this.ampdoc.getElementById(containerId);
    return user().assertElement(
      dialogContainer,
      'No element found with given id',
      containerId
    );
  }

  /**
   * Creates the paywall component and append it to dialog container
   * @private
   */
  renderPurchaseOverlay_() {
    // [TODO]: Create entire paywall element with button event listener for login flow
    this.dialogContainer_ = this.getPaywallContainer_();
    this.innerContainer_ = createElementWithAttributes(
      this.ampdoc.win.document,
      'div',
      {
        class: TAG_SHORTHAND + '-container',
      }
    );

    // Creating header text of paywall
    const headerText = createElementWithAttributes(
      this.ampdoc.win.document,
      'div',
      {
        class: TAG_SHORTHAND + '-headerText',
      }
    );

    headerText.textContent = this.i18n_['fcTitleText'];
    this.innerContainer_.appendChild(headerText);

    // Creating unlock button on paywall
    const unlockButton = createElementWithAttributes(
      this.ampdoc.win.document,
      'button',
      {
        class: TAG_SHORTHAND + '-purchase-button',
      }
    );

    unlockButton.textContent = this.i18n_['fcButtonText'];
    this.innerContainer_.appendChild(unlockButton);

    this.dialogContainer_.appendChild(this.innerContainer_);
    this.containerEmpty_ = false;
  }
}
