// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview French catalog — mirrors `en.js` key for key (pinned by
 * `src/core/i18n.test.js`). French typography: a narrow no-break space
 * (U+202F) before `;` `!` `?` `:` and inside « », typographic apostrophes.
 *
 * @module notepad/i18n/fr
 */

export const fr = Object.freeze({
    app: {
        title: 'AWA Notepad',
        tagline: 'Écrivez et modifiez vos fichiers texte sur votre appareil.',
        region: 'Éditeur de texte',
        regionWith: 'Éditeur de texte\u202f: {name}',
        language: 'Langue'
    },
    doc: {
        untitled: 'Sans titre',
        nameField: 'Nom du fichier',
        modified: '(modifié)',
        text: 'Texte'
    },
    toolbar: {
        help: 'Aide',
        label: 'Outils de l’éditeur',
        new: 'Nouveau (Ctrl+N)',
        rename: 'Renommer « {name} »',
        download: 'Télécharger une copie (Ctrl+S)',
        downloadAs: 'Télécharger une copie sous un autre nom (Ctrl+Maj+S)',
        open: 'Ouvrir un fichier (Ctrl+O)',
        save: 'Enregistrer (Ctrl+S)',
        saveAs: 'Enregistrer sous (Ctrl+Maj+S)',
        find: 'Rechercher (Ctrl+F)',
        replace: 'Remplacer (Ctrl+H)',
        goto: 'Atteindre la ligne (Ctrl+G)',
        wrap: 'Retour automatique à la ligne',
        zoomOut: 'Texte plus petit',
        zoomIn: 'Texte plus grand'
    },
    find: {
        label: 'Rechercher et remplacer',
        find: 'Rechercher',
        replace: 'Remplacer par',
        matchCase: 'Respecter la casse',
        prev: 'Précédent (Maj+F3)',
        next: 'Suivant (F3)',
        replaceOne: 'Remplacer',
        replaceAll: 'Remplacer tout',
        close: 'Fermer (Échap)',
        count: 'Occurrence {index} sur {count}',
        notFound: '«\u202f{query}\u202f» est introuvable.',
        replaced: { one: '{count} occurrence remplacée.', other: '{count} occurrences remplacées.' }
    },
    goto: {
        label: 'Atteindre la ligne',
        line: 'Numéro de ligne',
        go: 'Atteindre',
        close: 'Fermer (Échap)',
        beyond: 'Le numéro de ligne dépasse le nombre total de lignes ({count}).'
    },
    status: {
        label: 'État du document',
        position: 'Ln {line}, Col {col}',
        chars: { one: '{count} caractère', other: '{count} caractères' },
        zoom: 'Taille du texte {zoom}',
        eol: 'Fins de ligne',
        encoding: 'Encodage',
        opened: '{name} est ouvert.',
        opening: 'Ouverture de {name}… {percent}',
        cancel: 'Annuler',
        openCancelled: 'Ouverture de {name} annulée.',
        largeFile: 'Fichier volumineux : la saisie peut être lente.',
        renamed: 'Le fichier s’appelle maintenant {name}.',
        renamedNext: 'Le prochain enregistrement s’appellera {name}.',
        downloadNote: 'Enregistré comme copie dans vos téléchargements : ce navigateur ne peut pas écrire dans le fichier lui-même.',
        saved: '{name} est enregistré.',
        downloaded: '{name} est téléchargé.',
        newDoc: 'Nouveau document.',
        restored: 'Texte non enregistré restauré.'
    },
    eol: {
        crlf: 'Windows (CRLF)',
        lf: 'Unix (LF)',
        cr: 'Macintosh (CR)'
    },
    encoding: {
        'utf-8': 'UTF-8',
        'utf-8-bom': 'UTF-8 avec BOM',
        'utf-16le': 'UTF-16 LE',
        'utf-16be': 'UTF-16 BE',
        'windows-1252': 'Windows-1252 (ANSI)'
    },
    ask: {
        title: 'AWA Notepad',
        unsaved: 'Voulez-vous enregistrer les modifications de {name}\u202f?',
        save: 'Enregistrer',
        discard: 'Ne pas enregistrer',
        cancel: 'Annuler',
        ok: 'OK',
        lossy: { one: '{count} caractère ne peut pas être écrit en {encoding}\u202f: il serait enregistré comme «\u202f?\u202f».', other: '{count} caractères ne peuvent pas être écrits en {encoding}\u202f: ils seraient enregistrés comme «\u202f?\u202f».' },
        lossyUtf8: 'Enregistrer en UTF-8',
        lossyKeep: 'Enregistrer quand même'
    },
    error: {
        binary: '{name} n’est pas un fichier texte. L’ouvrir ici pourrait l’endommager.',
        tooLarge: '{name} est trop volumineux pour être modifié ici (plus de {size}).',
        read: '{name} n’a pas pu être lu.',
        write: '{name} n’a pas pu être enregistré. Vérifiez que vous pouvez y écrire, puis réessayez.',
        rename: '{name} n’a pas pu être renommé en {next}. Utilisez Enregistrer sous pour l’enregistrer sous ce nom.'
    },
    more: {
        notOpened: { one: '{count} autre fichier n’a pas été ouvert.', other: '{count} autres fichiers n’ont pas été ouverts.' },
        waiting: { one: 'Un autre fichier attend : {name}.', other: '{count} autres fichiers attendent. Le suivant : {name}.' },
        open: 'Ouvrir {name} dans une nouvelle fenêtre',
        dismiss: 'Ignorer'
    },
    pwa: {
        install: 'Installer le bloc-notes',
        offline: 'Fonctionne hors ligne après une première visite.',
        updateReady: 'Une nouvelle version du bloc-notes est prête. La mise à jour le recharge ; le texte non enregistré revient comme brouillon.',
        update: 'Mettre à jour',
        later: 'Plus tard'
    },
    help: {
        title: 'AWA Notepad — Aide',
        close: 'Fermer (Échap)',
        unavailable: 'L’aide n’a pas pu être chargée. Reconnectez-vous une fois : elle restera ensuite disponible hors ligne.'
    },
    about: {
        open: 'À propos',
        title: 'À propos d’AWA Notepad',
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
