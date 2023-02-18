/**
 * @license
 * Copyright 2022 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import {html, LitElement, PropertyValues} from 'lit';
import {property, query, state} from 'lit/decorators.js';
import {classMap} from 'lit/directives/class-map.js';

import {EASING} from '../../motion/animation.js';

const PRESS_GROW_MS = 450;
const MINIMUM_PRESS_MS = 225;
const INITIAL_ORIGIN_SCALE = 0.2;
const PADDING = 10;
const SOFT_EDGE_MINIMUM_SIZE = 75;
const SOFT_EDGE_CONTAINER_RATIO = 0.35;
const PRESS_PSEUDO = '::after';
const ANIMATION_FILL = 'forwards';

// TODO(b/269633197): do not export State
/**
 * Interaction states for the ripple.
 *
 * On Touch:
 *  - `INACTIVE -> TOUCH_DELAY -> WAITING_FOR_CLICK -> INACTIVE`
 *  - `INACTIVE -> TOUCH_DELAY -> HOLDING -> WAITING_FOR_CLICK -> INACTIVE`
 *
 * On Mouse or Pen:
 *   - `INACTIVE -> WAITING_FOR_CLICK -> INACTIVE`
 */
export enum State {
  /**
   * Initial state of the control, no touch in progress.
   *
   * Transitions:
   *   - on touch down: transition to `TOUCH_DELAY`.
   *   - on mouse down: transition to `WAITING_FOR_CLICK`.
   */
  INACTIVE,
  /**
   * Touch down has been received, waiting to determine if it's a swipe or
   * scroll.
   *
   * Transitions:
   *   - on touch up: begin press; transition to `WAITING_FOR_CLICK`.
   *   - on cancel: transition to `INACTIVE`.
   *   - after `TOUCH_DELAY_MS`: begin press; transition to `HOLDING`.
   */
  TOUCH_DELAY,
  /**
   * A touch has been deemed to be a press
   *
   * Transitions:
   *  - on up: transition to `WAITING_FOR_CLICK`.
   */
  HOLDING,
  /**
   * The user touch has finished, transition into rest state.
   *
   * Transitions:
   *   - on click end press; transition to `INACTIVE`.
   */
  WAITING_FOR_CLICK
}

/**
 * A ripple component.
 */
export class Ripple extends LitElement {
  // TODO(https://bugs.webkit.org/show_bug.cgi?id=247546)
  // Remove Safari workaround that requires reflecting `unbounded` so
  // it can be styled against.
  /**
   * Sets the ripple to be an unbounded circle.
   */
  @property({type: Boolean, reflect: true}) unbounded = false;

  /**
   * Disables the ripple.
   */
  @property({type: Boolean, reflect: true}) disabled = false;

  @state() private hovered = false;
  @state() private focused = false;
  @state() private pressed = false;

  @query('.surface') private readonly mdRoot!: HTMLElement;
  private rippleSize = '';
  private rippleScale = '';
  private initialSize = 0;
  private growAnimation?: Animation;
  private delayedEndPressHandle?: number;
  // TODO(b/269633197): make ripple state private
  state = State.INACTIVE;

  handlePointerenter(event: PointerEvent) {
    if (this.isTouch(event) || !this.shouldReactToEvent(event)) {
      return;
    }

    this.hovered = true;
  }

  handlePointerleave(event: PointerEvent) {
    if (!this.shouldReactToEvent(event)) {
      return;
    }

    this.hovered = false;
  }

  handleFocusin() {
    this.focused = true;
  }

  handleFocusout() {
    this.focused = false;
  }

  beginPress(positionEvent?: Event|null) {
    this.pressed = true;
    clearTimeout(this.delayedEndPressHandle);
    this.startPressAnimation(positionEvent);
  }

  endPress() {
    const pressAnimationPlayState = this.growAnimation?.currentTime ?? Infinity;
    if (pressAnimationPlayState >= MINIMUM_PRESS_MS) {
      this.pressed = false;
    } else {
      this.delayedEndPressHandle = setTimeout(() => {
        this.pressed = false;
      }, MINIMUM_PRESS_MS - pressAnimationPlayState);
    }
  }

  protected override render() {
    const classes = {
      'hovered': this.hovered,
      'focused': this.focused,
      'pressed': this.pressed,
      'unbounded': this.unbounded,
    };

    return html`<div class="surface ${classMap(classes)}"></div>`;
  }

  protected override update(changedProps: PropertyValues<this>) {
    if (changedProps.has('disabled') && this.disabled) {
      this.hovered = false;
      this.focused = false;
      this.endPress();
    }
    super.update(changedProps);
  }

  private getDimensions() {
    return (this.parentElement ?? this).getBoundingClientRect();
  }

  private determineRippleSize() {
    const {height, width} = this.getDimensions();
    const maxDim = Math.max(height, width);
    const softEdgeSize =
        Math.max(SOFT_EDGE_CONTAINER_RATIO * maxDim, SOFT_EDGE_MINIMUM_SIZE);


    let maxRadius = maxDim;
    let initialSize = Math.floor(maxDim * INITIAL_ORIGIN_SCALE);

    const hypotenuse = Math.sqrt(width ** 2 + height ** 2);
    maxRadius = hypotenuse + PADDING;

    // ensure `initialSize` is even for unbounded
    if (this.unbounded) {
      initialSize = initialSize - (initialSize % 2);
    }

    this.initialSize = initialSize;
    this.rippleScale = `${(maxRadius + softEdgeSize) / initialSize}`;
    this.rippleSize = `${this.initialSize}px`;
  }

  private getNormalizedPointerEventCoords(pointerEvent: PointerEvent):
      {x: number, y: number} {
    const {scrollX, scrollY} = window;
    const {left, top} = this.getDimensions();
    const documentX = scrollX + left;
    const documentY = scrollY + top;
    const {pageX, pageY} = pointerEvent;
    return {x: pageX - documentX, y: pageY - documentY};
  }

  private getTranslationCoordinates(positionEvent?: Event|null) {
    const {height, width} = this.getDimensions();
    // end in the center
    const endPoint = {
      x: (width - this.initialSize) / 2,
      y: (height - this.initialSize) / 2,
    };

    let startPoint;
    if (positionEvent instanceof PointerEvent) {
      startPoint = this.getNormalizedPointerEventCoords(positionEvent);
    } else {
      startPoint = {
        x: width / 2,
        y: height / 2,
      };
    }

    // center around start point
    startPoint = {
      x: startPoint.x - (this.initialSize / 2),
      y: startPoint.y - (this.initialSize / 2),
    };

    return {startPoint, endPoint};
  }

  private startPressAnimation(positionEvent?: Event|null) {
    this.growAnimation?.cancel();
    this.determineRippleSize();
    const {startPoint, endPoint} =
        this.getTranslationCoordinates(positionEvent);
    const translateStart = `${startPoint.x}px, ${startPoint.y}px`;
    const translateEnd = `${endPoint.x}px, ${endPoint.y}px`;

    this.growAnimation = this.mdRoot.animate(
        {
          top: [0, 0],
          left: [0, 0],
          height: [this.rippleSize, this.rippleSize],
          width: [this.rippleSize, this.rippleSize],
          transform: [
            `translate(${translateStart}) scale(1)`,
            `translate(${translateEnd}) scale(${this.rippleScale})`
          ],
        },
        {
          pseudoElement: PRESS_PSEUDO,
          duration: PRESS_GROW_MS,
          easing: EASING.STANDARD,
          fill: ANIMATION_FILL
        });
  }

  /**
   * Returns `true` if
   *  - the ripple element is enabled
   *  - the pointer is primary for the input type
   */
  private shouldReactToEvent(event: PointerEvent) {
    return !this.disabled && event.isPrimary;
  }

  private isTouch({pointerType}: PointerEvent) {
    return pointerType === 'touch';
  }
}
