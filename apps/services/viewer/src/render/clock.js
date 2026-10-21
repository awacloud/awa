// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Time slicing for the painters: a heavy page, image or
 * sheet gives the event loop a turn every few tens of milliseconds,
 * so scrolling, input and the other pages go on while it draws.
 *
 * @module viewer/render/clock
 */

/** Give the event loop a turn. @returns {Promise<void>} */
export const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));

/**
 * Milliseconds. `Date.now`, not `performance.now`: fw sanity `base` (the
 * standalone page) blocks the high-resolution clock and only coarsens
 * `Date.now`, which is plenty to cut work into slices.
 */
export const clock = () => Date.now();
