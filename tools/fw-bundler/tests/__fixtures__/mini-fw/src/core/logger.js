// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

// Fixture core stub — logger with main()/worker().
export const logger = {
    main(_dev) {
        return { info() {}, warn() {}, error() {} };
    },
    worker() {
        // Serialized to a worker via .toString() by the generated entry.
    },
};
