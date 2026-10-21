# AWA Markdown

> **Afficher du Markdown que vous n'avez pas écrit, assaini par défaut**

Les réponses d'une IA et les contenus de vos utilisateurs sont des entrées non fiables. AWA Markdown les affiche et les transforme ; scripts et liens dangereux sont bloqués par défaut. Le Markdown est le format de texte que les IA lisent et écrivent nativement.

- [Fonctionnalités](#fonctionnalités)
- [Points forts](#points-forts)
- [Dans votre code](#dans-votre-code)
- [Licences et tarifs](#licences-et-tarifs)

## Fonctionnalités

- **Afficher** — Transforme du Markdown en HTML prêt à afficher : titres, listes, liens, images, code, ainsi que les ajouts de GitHub (tableaux, listes de tâches, texte barré, liens automatiques).
- **Réécrire** — Donne accès à l'arbre complet du document, pour réécrire les liens, décaler les titres ou caviarder un passage avant affichage ou indexation.
- **Réémettre** — Après modification, produit de nouveau du Markdown CommonMark et GFM sans casser sa structure.
- **Étendre** — Front matter, mathématiques, notes de bas de page, admonitions, table des matières, Mermaid : dix extensions à activer selon vos besoins.

## Points forts

| Points forts | |
|---|---|
| **Testé contre les standards** | AWA Markdown passe la totalité des 652 exemples officiels de CommonMark 0.31 ; les ajouts de GitHub sont couverts par une suite de cas tirés de leur spécification. |
| **Sûr par défaut** | Le HTML produit est assaini : scripts, cadres et liens dangereux sont bloqués sans configuration. |
| **Aucune dépendance tierce** | La bibliothèque ne s'appuie sur aucun paquet externe à l'exécution. |

## Dans votre code

Quelques lignes dans le navigateur, sans serveur ni envoi : cette page est rendue de la même façon.

```js
import { bootstrapMd } from '@awacloud/md/bootstrap.js';

const { md } = bootstrapMd();
md.renderHtml('# Hello\n\n*world*');
// → '<h1>Hello</h1>\n<p><em>world</em></p>\n'
```

## Licences et tarifs

> **490 € HT** par application et par an, utilisateurs et serveurs illimités.

Développeurs, serveurs et utilisateurs illimités. Licence commerciale ou AGPL-3.0-only.

---

*Réalisé avec AWA Markdown par AwaCloud. Ouvert ici par AWA Viewer, sur votre appareil : rien n’a été envoyé. Offres et tarifs : [awacloud.com/fr/offers](https://awacloud.com/fr/offers)*
