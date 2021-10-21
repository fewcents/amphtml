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

import {installStylesForDoc} from '../../../src/style-installer';
import {removeChildren} from '#core/dom';
import {user} from '../../../src/log';

import {Services} from '#service';

import {CSS} from '../../../build/amp-access-fewcents-0.1.css';

const TAG = 'amp-access-fewcents';

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
    this.innerContainer_.className = TAG + '-container';

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'header',
        'Instant Access With Fewcents.',
        '-header'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_('header', 'INR 50.46', '-article-price')
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_(
        'p',
        'First 1 unlocks are free!',
        '-no-of-Unlock'
      )
    );

    this.innerContainer_.appendChild(
      this.createAndAddProperty_('button', 'Unlock', '-purchase-button')
    );

    this.innerContainer_.appendChild(this.createRefRowElement_());

    dialogContainer.appendChild(this.innerContainer_);
    this.containerEmpty_ = false;
  }

  /**
   * @private
   */
  createRefRowElement_() {
    const refRow = this.createElement_('div');
    refRow.className = TAG + '-refRow';
    refRow.appendChild(
      this.createAnchorElement_('Terms', 'https://www.fewcents.co/terms')
    );

    refRow.appendChild(
      this.createAnchorElement_('Privacy', 'https://www.fewcents.co/privacy')
    );
    refRow.appendChild(
      this.createAnchorElement_('Contact Us', 'mailto:support@fewcents.co')
    );

    return refRow;
  }

  /**
   * @private
   */
  createAndAddProperty_(elementType, text, className) {
    const element = this.createElement_(elementType);
    element.className = TAG + className;
    element.textContent = text;
    return element;
  }

  /**
   * @private
   */
  createAnchorElement_(text, href) {
    const element = this.createElement_('a');
    element.className = TAG + '-refElements';
    element.href = href;
    element.target = '_blank';
    element.textContent = text;
    element.rel = 'noopener noreferrer';
    return element;
  }
}
