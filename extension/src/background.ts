// Background service worker entry point. Wires the message router and the context
// menus; all logic lives in the messaging/lookup/ocr/spellcheck modules.
import { registerRouter } from './messaging/router';
import { registerMenus } from './messaging/menus';

registerRouter();
registerMenus();
