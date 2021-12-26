/** @const {string} Extension name*/
export const TAG = 'amp-access-fewcents';

/** @const {string} Extension shorthand name used for CSS classes */
export const TAG_SHORTHAND = 'aaf';

/** @const {string} */
export const CONFIG_BASE_PATH =
  'https://api.hounds.fewcents.co/v1/amp/authorizeBid?articleUrl=SOURCE_URL&ampReaderId=READER_ID&returnUrl=RETURN_URL';

/** @const {number} */
export const AUTHORIZATION_TIMEOUT = 3000;

/** @const {JsonObject} */
export const DEFAULT_MESSAGES = {
  /* fc denotes fewcents */
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
