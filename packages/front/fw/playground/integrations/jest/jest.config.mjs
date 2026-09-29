// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { createRequire } from 'node:module';

const shim = createRequire(import.meta.url).resolve('@awacloud/fw/jest/shim');

export default {
    moduleNameMapper: { '^bun:test$': shim },
    transform: {},
    testEnvironment: 'node',
    testMatch: ['<rootDir>/src/**/*.test.js'],
};
