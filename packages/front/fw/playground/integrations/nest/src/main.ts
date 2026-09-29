// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module.js';
import { SignService } from './sign.service.js';

/**
 * Bootstraps the Nest application context (no HTTP server needed), resolves
 * the `SignService`, and logs the SHA-256 digest of a CBOR-encoded payload.
 */
async function bootstrap() {
    // createApplicationContext: standalone DI container, no HTTP listener.
    const app = await NestFactory.createApplicationContext(AppModule);

    const sign = app.get(SignService);
    const payload = { hello: 'world', n: 42 };

    console.log('payload:', JSON.stringify(payload));
    // Hex rendering is done by the fw `hex` codec inside the service.
    console.log('sha256(cbor(payload)):', sign.digestHex(payload));

    await app.close();
}

bootstrap();
