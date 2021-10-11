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

import '../amp-access-fewcents';
import {htmlFor} from '#core/dom/static-template';

describes.realWin(
  'amp-access-fewcents-v0.1',
  {
    amp: {
      runtimeOn: true,
      extensions: ['amp-access-fewcents:0.1'],
    },
  },
  (env) => {
    let win;
    let doc;
    let html;

    beforeEach(() => {
      win = env.win;
      doc = win.document;
      html = htmlFor(doc);
    });

    it('should contain "hello world" when built', async () => {
      const element = html`
        <amp-access-fewcents width="100" height="10" layout="responsive">
        </amp-access-fewcents>
      `;
      doc.body.appendChild(element);
      await element.whenBuilt();
      expect(element.querySelector('div').textContent).to.equal('hello world');
    });
  }
);
