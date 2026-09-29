// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import fw from '@awacloud/fw/vite';

export default {
    plugins: [fw({ preset: 'core', sanity: 'base' })]
};
