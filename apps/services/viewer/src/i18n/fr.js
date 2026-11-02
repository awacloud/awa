// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview French catalog of the standalone page — mirrors `en.js`
 * key for key (pinned by `src/core/i18n.test.js`). French typography: a
 * narrow no-break space (U+202F) before `:` `;` `?` `!` and inside `« »`.
 *
 * @module viewer/i18n/fr
 */

export const fr = Object.freeze({
    app: {
        name: 'viewer',
        title: 'AWA Viewer',
        tagline: 'Ouvrez un document et lisez-le sur votre appareil.',
        language: 'Langue'
    },
    more: {
        waiting: { one: 'Un autre fichier attend : {name}.', other: '{count} autres fichiers attendent. Le suivant : {name}.' },
        open: 'Ouvrir {name} dans une nouvelle fenêtre',
        dismiss: 'Ignorer'
    },
    pwa: {
        install: 'Installer la visionneuse',
        offline: 'Fonctionne hors ligne après une première visite.',
        updateReady: 'Une nouvelle version de la visionneuse est prête.',
        update: 'Mettre à jour',
        later: 'Plus tard'
    },
    help: {
        title: 'AWA Viewer — Aide',
        close: 'Fermer (Échap)',
        unavailable: 'L’aide n’a pas pu être chargée. Reconnectez-vous une fois : elle restera ensuite disponible hors ligne.'
    },
    about: {
        open: 'À propos',
        title: 'À propos d’AWA Viewer',
        licence: 'Logiciel libre sous licence GNU Affero General Public License, version 3 uniquement (AGPL-3.0-only), également disponible sous licence commerciale. Il est fourni sans aucune garantie. Vous pouvez le partager et le modifier selon les termes de cette licence.',
        licenceText: 'Texte de la licence (AGPL-3.0)',
        notice: 'Mentions et conditions additionnelles',
        check: 'Rechercher une mise à jour',
        checking: 'Recherche en cours…',
        current: 'Vous avez la dernière version.',
        ready: 'Une nouvelle version est prête.',
        offline: 'Impossible de vérifier : vous semblez hors ligne.',
        unavailable: 'Ce navigateur ne peut pas rechercher de mise à jour.',
        build: 'build {version}',
        dev: 'version de développement',
        promo: 'Conçu par AwaCloud — des logiciels respectueux de votre vie privée, qui tournent sur votre appareil.',
        promoLink: 'Découvrez awacloud.com',
        close: 'Fermer'
    }
});
