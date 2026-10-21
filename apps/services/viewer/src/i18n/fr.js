// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: AGPL-3.0-only
// Dual-licensed; see the NOTICE file for licensing and any additional terms.

/**
 * @fileoverview French catalog — mirrors `en.js` key for key (pinned by
 * `src/core/i18n.test.js`). French typography: a narrow no-break space
 * (U+202F) before `:` `;` `?` `!` and inside `« »`, written as an escape.
 *
 * @module viewer/i18n/fr
 */

export const fr = Object.freeze({
    app: {
        name: 'viewer',
        title: 'AWA Viewer',
        tagline: 'Ouvrez un document et lisez-le sur votre appareil.',
        privacy: 'Votre fichier reste sur cet appareil.',
        region: 'Visionneuse de documents',
        regionWith: 'Visionneuse de documents : {name}',
        language: 'Langue'
    },
    intake: {
        samples: 'Pas de document sous la main ? Essayez un exemple :',
        title: 'Ouvrir un document',
        drop: 'Déposez un document ici, ou',
        choose: 'choisissez un fichier',
        formats: 'PDF, Word, Excel, PowerPoint, OpenDocument, Markdown et fichiers texte.',
        dropping: 'Relâchez pour ouvrir le document.',
        onlyFirst: { one: '{name} est ouvert ; {count} autre fichier n’a pas été ouvert.', other: '{name} est ouvert ; {count} autres fichiers n’ont pas été ouverts.' }
    },
    more: {
        waiting: { one: 'Un autre fichier attend : {name}.', other: '{count} autres fichiers attendent. Le suivant : {name}.' },
        open: 'Ouvrir {name} dans une nouvelle fenêtre',
        dismiss: 'Ignorer'
    },
    toolbar: {
        help: 'Aide',
        label: 'Outils du document',
        open: 'Ouvrir un document',
        close: 'Fermer le document',
        prev: 'Page précédente',
        next: 'Page suivante',
        page: 'Numéro de page',
        of: 'sur {count}',
        zoomOut: 'Zoom arrière',
        zoomIn: 'Zoom avant',
        zoom: 'Niveau de zoom',
        fitWidth: 'Ajuster à la largeur',
        fullscreen: 'Plein écran',
        exitFullscreen: 'Quitter le plein écran',
        download: 'Télécharger l’original',
        info: 'Détails du document'
    },
    status: {
        opening: 'Ouverture de {name}…',
        rendering: 'Affichage du document…',
        opened: '{name} est ouvert.',
        closed: 'Le document est fermé.',
        page: 'Page {page} sur {count}.',
        zoom: 'Zoom {zoom}.'
    },
    count: {
        pages: { one: '{count} page', other: '{count} pages' },
        slides: { one: '{count} diapositive', other: '{count} diapositives' },
        sheets: { one: '{count} feuille', other: '{count} feuilles' }
    },
    view: {
        content: 'Contenu du document',
        page: 'Page {page} sur {count}',
        slide: 'Diapositive {page} sur {count}',
        sheets: 'Feuilles',
        sheetN: 'Feuille {n}',
        noteBack: 'Retour au texte',
        emptySheet: 'Cette feuille est vide.',
        emptyDocument: 'Ce document n’a aucun contenu à afficher.',
        image: 'Image',
        imageNamed: 'Image : {name}',
        unavailable: 'Non affiché : {what}'
    },
    info: {
        sample: 'Exemple fourni par AwaCloud',
        title: 'Détails du document',
        file: 'Fichier',
        format: 'Format',
        size: 'Taille',
        length: 'Longueur',
        docTitle: 'Titre',
        author: 'Auteur',
        omissions: 'Ce que cet affichage laisse de côté',
        noOmission: 'Aucune omission enregistrée pour cet affichage.',
        omissionCount: { one: '{label} ({count} fois)', other: '{label} ({count} fois)' }
    },
    format: {
        pdf: 'Document PDF',
        docx: 'Document Word',
        xlsx: 'Classeur Excel',
        pptx: 'Présentation PowerPoint',
        odt: 'Texte OpenDocument',
        ods: 'Classeur OpenDocument',
        odp: 'Présentation OpenDocument',
        md: 'Texte Markdown',
        text: 'Texte brut',
        'legacy-doc': 'Document Word 97–2003',
        'legacy-xls': 'Classeur Excel 97–2003',
        'legacy-ppt': 'Présentation PowerPoint 97–2003',
        legacy: 'Fichier Microsoft Office 97–2003',
        encrypted: 'Fichier protégé par mot de passe',
        unknown: 'Type de fichier inconnu'
    },
    error: {
        pageFailed: 'Cette page n’a pas pu être dessinée.',
        unsupported: 'Ce type de fichier n’est pas pris en charge. Ouvrez un PDF, un fichier Office ou OpenDocument, du Markdown ou du texte.',
        legacy: 'C’est un ancien fichier Microsoft Office. La visionneuse ne peut pas encore l’ouvrir. Enregistrez-le en .docx, .xlsx ou .pptx, puis rouvrez-le.',
        encrypted: 'Ce document est protégé par un mot de passe. La visionneuse ne peut pas l’ouvrir.',
        encryptedUnsupported: 'Ce document est chiffré d’une façon que la visionneuse ne sait pas encore lire.',
        read: 'Ce fichier n’a pas pu être lu. Il est peut-être endommagé, ou n’est pas un fichier valide ({format}).',
        fileUnreadable: 'Ce fichier n’a pas pu être lu depuis votre appareil. Vérifiez qu’il s’y trouve toujours, puis réessayez.',
        tooLarge: 'Ce document est trop volumineux ou trop complexe pour la visionneuse : l’ouvrir demanderait trop de mémoire ou de temps.',
        empty: 'Ce fichier est vide.',
        source: 'Ce document n’a pas pu être chargé.',
        tryAnother: 'Essayer un autre fichier'
    },
    omission: {
        'page/failed': 'des pages qui n’ont pas pu être dessinées',
        'text/truncated': 'la fin d’un très long texte (les 5 premiers millions de caractères sont affichés)',
        'md/remote-image': 'les images (un fichier Markdown ne fait que les désigner ; non chargées, pour votre confidentialité)',
        'md/too-complex': 'la mise en forme Markdown (trop imbriquée : affichée en texte brut)',
        'pdf/shading': 'les dégradés de couleur',
        'pdf/soft-mask': 'les masques de transparence',
        'pdf/pattern': 'les remplissages à motif',
        'pdf/image-jpx': 'les images JPEG 2000',
        'pdf/image-undecodable': 'les images dans un encodage non pris en charge',
        'pdf/colorspace': 'les espaces colorimétriques spéciaux (affichés de façon approchée)',
        'pdf/font-substituted': 'les polices intégrées (texte affiché avec une police proche)',
        'pdf/text-undecodable': 'des caractères sans texte connu',
        'pdf/form-depth': 'les dessins très imbriqués',
        'pdf/too-complex': 'la fin des pages trop complexes',
        'pdf/operator': 'des instructions de dessin endommagées',
        'pdf/annotation': 'les annotations et champs de formulaire',
        'pdf/content-undecodable': 'du contenu de page endommagé',
        'doc/chart': 'les graphiques',
        'doc/shape': 'les formes dessinées',
        'doc/math': 'les équations',
        'doc/header-footer': 'les en-têtes et pieds de page',
        'doc/footnote': 'les notes de bas de page',
        'doc/comment': 'les commentaires',
        'doc/image-missing': 'des images manquantes',
        'image/format': 'les images dans un format que le navigateur ne sait pas afficher (EMF, WMF, TIFF)',
        'sheet/truncated': 'les lignes et colonnes au-delà des 2 000 premières lignes, 200 premières colonnes ou 100 000 premières cellules d’une feuille',
        'sheet/chart': 'les graphiques',
        'sheet/image': 'les images posées sur les cellules',
        'sheet/formula': 'les formules (les dernières valeurs enregistrées sont affichées)',
        'slide/chart': 'les graphiques',
        'slide/table': 'les tableaux',
        'slide/effect': 'les ombres et effets',
        'slide/gradient': 'les dégradés (affichés en couleur unie)',
        'slide/geometry': 'les contours de formes (affichés en rectangles)',
        'slide/notes': 'les notes de l’orateur',
        'slide/media': 'l’audio et la vidéo'
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
