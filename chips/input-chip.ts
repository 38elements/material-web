/**
 * @license
 * Copyright 2023 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {customElement} from 'lit/decorators.js';

import {InputChip} from './lib/input-chip.js';
import {styles as forcedColorsStyles} from './lib/input-forced-colors-styles.css.js';
import {styles} from './lib/input-styles.css.js';
import {styles as selectableStyles} from './lib/selectable-styles.css.js';
import {styles as sharedStyles} from './lib/shared-styles.css.js';
import {styles as trailingIconStyles} from './lib/trailing-icon-styles.css.js';

declare global {
  interface HTMLElementTagNameMap {
    'md-input-chip': MdInputChip;
  }
}

/**
 * TODO(b/243982145): add docs
 *
 * @final
 * @suppress {visibility}
 */
@customElement('md-input-chip')
export class MdInputChip extends InputChip {
  static override styles = [
    sharedStyles, trailingIconStyles, selectableStyles, styles,
    forcedColorsStyles
  ];
}
