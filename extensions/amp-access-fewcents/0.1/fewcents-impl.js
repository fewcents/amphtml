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
import {user} from '../../../src/log';

import {Services} from '#service';

import {CSS} from '../../../build/amp-access-fewcents-0.1.css';

const TAG = 'amp-access-fewcents';

const TAG_SHORTHAND = 'aaf';

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
   */
  constructor(accessService) {
    /** @const */
    this.ampdoc = accessService.ampdoc;

    /** @private {boolean} */
    this.containerEmpty_ = true;

    /** @private {?Node} */
    this.innerContainer_ = null;

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
    this.emptyContainer_().then(this.renderPurchaseOverlay_.bind(this));
    return {access: false};
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
        this.i18n_['fcPublisherImageRef'],
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
}
