// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview Test-only helper — builds a minimal ModuleRuntime
 * containing the block dependency graph (no inline parser, no
 * orchestrator). Used by sibling block test files so they don't
 * transitively import the full main.js graph.
 *
 * NOT part of the public surface.
 */

import { ModuleRuntime } from '@awacloud/fw/core/runtime.js';
import { htmlEntities as _fwHtmlEntities } from '@awacloud/fw/io/text/html-entities.js';
import { url as _fwUrl } from '@awacloud/fw/io/codec/url.js';
import { mdErrors } from '../errors.js';
import { mdCommon } from '../common.js';
import { mdAstTypes } from '../ast/types.js';
import { mdNode } from '../ast/node.js';
import { refsLinkRefs } from '../refs/linkRefs.js';
import { mdBlockHtmlPatterns } from './html-patterns.js';
import { mdBlockLinkRef } from './link-ref.js';
import { mdBlockListData } from './list-data.js';
import { mdBlockTable } from './table.js';
import { mdBlockTaskList } from './task-list.js';
import { mdBlockTypes } from './block-types.js';
import { mdBlockStarts } from './block-starts.js';
import { mdBlockCursor } from './cursor.js';
import { blockParser } from './parser.js';

const _rt = new ModuleRuntime();
_rt.register(_fwHtmlEntities);
_rt.register(_fwUrl);
_rt.register(mdErrors);
_rt.register(mdCommon);
_rt.register(mdAstTypes);
_rt.register(mdNode);
_rt.register(refsLinkRefs);
_rt.register(mdBlockHtmlPatterns);
_rt.register(mdBlockLinkRef);
_rt.register(mdBlockListData);
_rt.register(mdBlockTable);
_rt.register(mdBlockTaskList);
_rt.register(mdBlockTypes);
_rt.register(mdBlockStarts);
_rt.register(mdBlockCursor);
_rt.register(blockParser);

export const testRuntime = _rt;
