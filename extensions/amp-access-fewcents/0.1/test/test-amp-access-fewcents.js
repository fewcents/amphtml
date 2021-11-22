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

import {AmpAccessFewcents} from '../fewcents-impl';

const paywallResponse = {
  success: true,
  message: 'Amp article price returned with unlock url.',
  data: {
    loginUrl:
      'https://wallet.hounds.fewcents.co?login_source=amp_paywall&login_publisher_id=47&login_publisher_bid_id=90531&bid_mode=paywall&bid_price=622.38&login_redirect_url=http%3A%2F%2Flocalhost%3A8000%2Fexamples%2Famp-access-fewcents.html&login_publisher_logo_url=https%3A%2F%2Fi1.wp.com%2Fthefix.media%2Fwp-content%2Fuploads%2F2021%2F04%2Flogo-no-margins.png&amp_reader_id=amp-yfpD7ewsxdSdbH4xCboNIw',
    purchaseOptions: [
      {
        price: {
          currency: 'INR',
          price: 622.38,
        },
        unlockUrl:
          'https://wallet.hounds.fewcents.co?login_source=amp_paywall&login_publisher_id=47&login_publisher_bid_id=90531&bid_mode=paywall&bid_price=622.38&login_redirect_url=http%3A%2F%2Flocalhost%3A8000%2Fexamples%2Famp-access-fewcents.html&login_publisher_logo_url=https%3A%2F%2Fi1.wp.com%2Fthefix.media%2Fwp-content%2Fuploads%2F2021%2F04%2Flogo-no-margins.png&amp_reader_id=amp-yfpD7ewsxdSdbH4xCboNIw',
      },
    ],
    bidId: 90531,
    access: false,
  },
  statusCode: 402,
};

describes.realWin(
  'amp-access-fewpaywallResponsecents-v0.1',
  {
    amp: {
      runtimeOn: true,
      extensions: ['amp-access-fewcents:0.1'],
    },
  },
  (env) => {
    // let win;
    // let doc;
    // let html;
    // let document,
    let ampdoc;
    let accessSource;
    let accessService;
    let accessSourceMock;
    let xhrMock;
    let fewcentsConfig;
    let vendor;

    beforeEach(() => {
      // win = env.win;
      ampdoc = env.ampdoc;
      // document = win.document;

      fewcentsConfig = {
        articleTitleSelector: '#laterpay-test-title',
        region: 'us',
      };

      accessSource = {
        getAdapterConfig: () => {
          return fewcentsConfig;
        },
        buildUrl: () => {},
        loginWithUrl: () => {},
        getLoginUrl: () => {},
      };

      accessService = {
        ampdoc,
        getSource: () => accessSource,
      };

      accessSourceMock = env.sandbox.mock(accessSource);
      vendor = new AmpAccessFewcents(accessService, accessSource);
      xhrMock = env.sandbox.mock(vendor.xhr_);
    });

    afterEach(() => {
      accessSourceMock.verify();
      xhrMock.verify();
    });

    describe('authorize', () => {
      let emptyContainerStub;
      beforeEach(() => {
        emptyContainerStub = env.sandbox.stub(vendor, 'emptyContainer_');
        env.sandbox.stub(vendor, 'renderPurchaseOverlay_');
      });

      it('should show the premium content', () => {
        accessSourceMock
          .expects('buildUrl')
          .returns(Promise.resolve(''))
          .once();

        xhrMock
          .expects('fetchJson')
          .returns(
            Promise.resolve({
              json() {
                return Promise.resolve({access: true});
              },
            })
          )
          .once();

        return vendor.authorize().then((resp) => {
          expect(resp.access).to.be.true;
          expect(emptyContainerStub.called).to.be.true;
        });
      });

      it('should show the paywall : authorization response fails - 402 error', () => {
        accessSourceMock
          .expects('buildUrl')
          .returns(Promise.resolve('https://builturl'))
          .once();

        xhrMock
          .expects('fetchJson')
          .returns(
            Promise.reject({
              response: {
                status: 402,
                json() {
                  return Promise.resolve(paywallResponse);
                },
              },
            })
          )
          .once();

        emptyContainerStub.returns(Promise.resolve());
        return vendor.authorize().then((res) => {
          expect(res.access).to.be.false;
        });
      });

      it('should show the premium : authorization response fails - 500 error', () => {
        accessSourceMock
          .expects('buildUrl')
          .returns(Promise.resolve('https://builturl'))
          .once();

        xhrMock
          .expects('fetchJson')
          .returns(
            Promise.reject({
              response: {
                status: 500,
              },
            })
          )
          .once();

        return vendor.authorize().then((res) => {
          expect(res.access).to.be.true;
        });
      });
    });
  }
);
