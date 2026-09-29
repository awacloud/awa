// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

/**
 * @description
 * ASN.1 Object Identifier database with reverse lookup (name → OID,
 * OID → name). Categorised by usage : PKCS#1/5/7/9, X.509 DN +
 * extensions, digest algorithms, ECC curves, PAdES signature
 * policies, AES OIDs.
 *
 * Companion to `asn1` parser (`@awacloud/fw/crypto/utils/asn1`) - the
 * parser returns OID strings, this module makes them readable.
 *
 * Includes ~150+ OIDs covering the common subset used by PKI, X.509,
 * CMS, JOSE, PAdES.
 *
 * @example
 * const oid = registry.resolve('asn1Oid');
 * oid.lookup('1.2.840.113549.1.1.11');
 * // → { name: 'sha256WithRSAEncryption', category: 'pkcs1', ... }
 * oid.byName('signedData'); // → '1.2.840.113549.1.7.2'
 */

/** @typedef {{ name: string, shortName: string, category: string, keyLen?: number, mode?: string, [key: string]: string|number|undefined }} OidEntry */

/**
 * Public shape returned by `asn1Oid.factory()`.
 * @typedef {object} Asn1OidAPI
 * @property {(oidStr: string) => (OidEntry|null)} lookup Resolve an OID string to its metadata entry.
 * @property {(nameOrShortName: string) => (string|null)} byName Reverse-lookup an OID string by name or shortName.
 * @property {(category: string) => Array<{ oid: string } & OidEntry>} findByCategory All entries for a category.
 * @property {Record<string, OidEntry>} OID_DATABASE Raw OID database keyed by dotted OID.
 */

export const asn1Oid = {
    name: 'asn1Oid',
    version: '1.0.0',
    type: 'fw.crypto.utils',
    dependencies: [],

    /** @returns {Asn1OidAPI} */
    factory() {

        /**
         * Raw OID database - built from RFCs 2313/2315/2898/5208/5280/8017/8410,
         * ITU-T X.520, ETSI EN 319 142 / TS 102 778, and ANSI X9.62.
         *
         * Format per entry:
         *   name      : canonical long name (unique, used by byName)
         *   shortName : abbreviated name often used in code / ASN.1 schemas
         *   category  : grouping key for findByCategory
         *   + optional domain-specific fields (hashAlg, sigAlg, curve, etc.)
         *
         * @type {Record<string, OidEntry>}
         */
        const OID_DATABASE = {

            // ── PKCS#1 (RFC 8017) ────────────────────────────────────────────────────
            '1.2.840.113549.1.1.1':  { name: 'rsaEncryption',             shortName: 'rsa',              category: 'pkcs1' },
            '1.2.840.113549.1.1.2':  { name: 'md2WithRSAEncryption',      shortName: 'md2WithRSA',        category: 'pkcs1', hashAlg: 'md2',    sigAlg: 'rsa' },
            '1.2.840.113549.1.1.4':  { name: 'md5WithRSAEncryption',      shortName: 'md5WithRSA',        category: 'pkcs1', hashAlg: 'md5',    sigAlg: 'rsa' },
            '1.2.840.113549.1.1.5':  { name: 'sha1WithRSAEncryption',     shortName: 'sha1WithRSA',       category: 'pkcs1', hashAlg: 'sha-1',  sigAlg: 'rsa' },
            '1.2.840.113549.1.1.11': { name: 'sha256WithRSAEncryption',   shortName: 'sha256WithRSA',     category: 'pkcs1', hashAlg: 'sha-256',sigAlg: 'rsa' },
            '1.2.840.113549.1.1.12': { name: 'sha384WithRSAEncryption',   shortName: 'sha384WithRSA',     category: 'pkcs1', hashAlg: 'sha-384',sigAlg: 'rsa' },
            '1.2.840.113549.1.1.13': { name: 'sha512WithRSAEncryption',   shortName: 'sha512WithRSA',     category: 'pkcs1', hashAlg: 'sha-512',sigAlg: 'rsa' },
            '1.2.840.113549.1.1.14': { name: 'sha224WithRSAEncryption',   shortName: 'sha224WithRSA',     category: 'pkcs1', hashAlg: 'sha-224',sigAlg: 'rsa' },
            '1.2.840.113549.1.1.10': { name: 'rsaPSS',                    shortName: 'rsaPSS',            category: 'pkcs1', sigAlg: 'rsa-pss' },
            '1.2.840.113549.1.1.7':  { name: 'rsaOAEP',                   shortName: 'rsaOAEP',           category: 'pkcs1', encAlg: 'rsa-oaep' },

            // ── PKCS#7 / CMS (RFC 2315 / RFC 5652) ──────────────────────────────────
            '1.2.840.113549.1.7.1':  { name: 'pkcs7-data',                     shortName: 'data',               category: 'pkcs7' },
            '1.2.840.113549.1.7.2':  { name: 'pkcs7-signedData',               shortName: 'signedData',          category: 'pkcs7' },
            '1.2.840.113549.1.7.3':  { name: 'pkcs7-envelopedData',            shortName: 'envelopedData',       category: 'pkcs7' },
            '1.2.840.113549.1.7.4':  { name: 'pkcs7-signedAndEnvelopedData',   shortName: 'signedAndEnveloped',  category: 'pkcs7' },
            '1.2.840.113549.1.7.5':  { name: 'pkcs7-digestedData',             shortName: 'digestedData',        category: 'pkcs7' },
            '1.2.840.113549.1.7.6':  { name: 'pkcs7-encryptedData',            shortName: 'encryptedData',       category: 'pkcs7' },
            '1.2.840.113549.1.9.16.1.2': { name: 'id-smime-ct-authenticatedData', shortName: 'authenticatedData', category: 'pkcs7' },

            // ── PKCS#9 (RFC 2985) ────────────────────────────────────────────────────
            '1.2.840.113549.1.9.1':  { name: 'pkcs9-emailAddress',         shortName: 'emailAddress',      category: 'pkcs9' },
            '1.2.840.113549.1.9.2':  { name: 'pkcs9-unstructuredName',     shortName: 'unstructuredName',  category: 'pkcs9' },
            '1.2.840.113549.1.9.3':  { name: 'pkcs9-contentType',          shortName: 'contentType',       category: 'pkcs9' },
            '1.2.840.113549.1.9.4':  { name: 'pkcs9-messageDigest',        shortName: 'messageDigest',     category: 'pkcs9' },
            '1.2.840.113549.1.9.5':  { name: 'pkcs9-signingTime',          shortName: 'signingTime',       category: 'pkcs9' },
            '1.2.840.113549.1.9.6':  { name: 'pkcs9-counterSignature',     shortName: 'counterSignature',  category: 'pkcs9' },
            '1.2.840.113549.1.9.7':  { name: 'pkcs9-challengePassword',    shortName: 'challengePassword', category: 'pkcs9' },
            '1.2.840.113549.1.9.14': { name: 'pkcs9-extensionRequest',     shortName: 'extensionRequest',  category: 'pkcs9' },
            '1.2.840.113549.1.9.15': { name: 'pkcs9-sMIMECapabilities',    shortName: 'sMIMECapabilities', category: 'pkcs9' },
            '1.2.840.113549.1.9.16.2.12': { name: 'id-aa-signingCertificate',  shortName: 'signingCertificate', category: 'pkcs9' },
            '1.2.840.113549.1.9.16.2.14': { name: 'id-aa-timeStampToken',      shortName: 'timeStampToken',     category: 'pkcs9' },
            '1.2.840.113549.1.9.16.2.47': { name: 'id-aa-signingCertificateV2', shortName: 'signingCertificateV2', category: 'pkcs9' },

            // ── Digest Algorithms (RFC 1321, FIPS 180-4, FIPS 202) ──────────────────
            '1.2.840.113549.2.5':   { name: 'md5',        shortName: 'md5',       category: 'digest' },
            '1.3.14.3.2.26':        { name: 'sha1',        shortName: 'sha1',      category: 'digest' },
            '2.16.840.1.101.3.4.2.4': { name: 'sha224',   shortName: 'sha224',    category: 'digest' },
            '2.16.840.1.101.3.4.2.1': { name: 'sha256',   shortName: 'sha256',    category: 'digest' },
            '2.16.840.1.101.3.4.2.2': { name: 'sha384',   shortName: 'sha384',    category: 'digest' },
            '2.16.840.1.101.3.4.2.3': { name: 'sha512',   shortName: 'sha512',    category: 'digest' },
            '2.16.840.1.101.3.4.2.5': { name: 'sha512-224', shortName: 'sha512-224', category: 'digest' },
            '2.16.840.1.101.3.4.2.6': { name: 'sha512-256', shortName: 'sha512-256', category: 'digest' },
            '2.16.840.1.101.3.4.2.7': { name: 'sha3-224',  shortName: 'sha3-224',  category: 'digest' },
            '2.16.840.1.101.3.4.2.8': { name: 'sha3-256',  shortName: 'sha3-256',  category: 'digest' },
            '2.16.840.1.101.3.4.2.9': { name: 'sha3-384',  shortName: 'sha3-384',  category: 'digest' },
            '2.16.840.1.101.3.4.2.10': { name: 'sha3-512', shortName: 'sha3-512',  category: 'digest' },
            '2.16.840.1.101.3.4.2.11': { name: 'shake128', shortName: 'shake128',  category: 'digest' },
            '2.16.840.1.101.3.4.2.12': { name: 'shake256', shortName: 'shake256',  category: 'digest' },
            '1.2.840.113549.2.7':   { name: 'hmacWithSHA1',   shortName: 'hmac-sha1',   category: 'digest' },
            '1.2.840.113549.2.8':   { name: 'hmacWithSHA224',  shortName: 'hmac-sha224', category: 'digest' },
            '1.2.840.113549.2.9':   { name: 'hmacWithSHA256',  shortName: 'hmac-sha256', category: 'digest' },
            '1.2.840.113549.2.10':  { name: 'hmacWithSHA384',  shortName: 'hmac-sha384', category: 'digest' },
            '1.2.840.113549.2.11':  { name: 'hmacWithSHA512',  shortName: 'hmac-sha512', category: 'digest' },

            // ── X.509 Distinguished Name attributes (ITU-T X.520 / RFC 5280) ────────
            '2.5.4.3':  { name: 'commonName',            shortName: 'CN',  category: 'x509-dn' },
            '2.5.4.4':  { name: 'surname',               shortName: 'SN',  category: 'x509-dn' },
            '2.5.4.5':  { name: 'serialNumber',          shortName: 'serialNumber', category: 'x509-dn' },
            '2.5.4.6':  { name: 'countryName',           shortName: 'C',   category: 'x509-dn' },
            '2.5.4.7':  { name: 'localityName',          shortName: 'L',   category: 'x509-dn' },
            '2.5.4.8':  { name: 'stateOrProvinceName',   shortName: 'ST',  category: 'x509-dn' },
            '2.5.4.9':  { name: 'streetAddress',         shortName: 'street', category: 'x509-dn' },
            '2.5.4.10': { name: 'organizationName',      shortName: 'O',   category: 'x509-dn' },
            '2.5.4.11': { name: 'organizationalUnitName',shortName: 'OU',  category: 'x509-dn' },
            '2.5.4.12': { name: 'title',                 shortName: 'title', category: 'x509-dn' },
            '2.5.4.13': { name: 'description',           shortName: 'description', category: 'x509-dn' },
            '2.5.4.17': { name: 'postalCode',            shortName: 'postalCode', category: 'x509-dn' },
            '2.5.4.18': { name: 'postOfficeBox',         shortName: 'postOfficeBox', category: 'x509-dn' },
            '2.5.4.20': { name: 'telephoneNumber',       shortName: 'telephoneNumber', category: 'x509-dn' },
            '2.5.4.41': { name: 'name',                  shortName: 'name', category: 'x509-dn' },
            '2.5.4.42': { name: 'givenName',             shortName: 'GN',  category: 'x509-dn' },
            '2.5.4.43': { name: 'initials',              shortName: 'initials', category: 'x509-dn' },
            '2.5.4.44': { name: 'generationQualifier',   shortName: 'generationQualifier', category: 'x509-dn' },
            '2.5.4.45': { name: 'uniqueIdentifier',      shortName: 'uniqueIdentifier', category: 'x509-dn' },
            '2.5.4.46': { name: 'dnQualifier',           shortName: 'dnQualifier', category: 'x509-dn' },
            '2.5.4.65': { name: 'pseudonym',             shortName: 'pseudonym', category: 'x509-dn' },
            // emailAddress: OID `1.2.840.113549.1.9.1` - declared in the PKCS#9
            // section. This OID serves both as an X.509 DN attribute (shortName
            // 'E', see RFC 4519/5280) and as a PKCS#9 attribute (RFC 2985). Do
            // not redeclare it here (would cause a key collision). The DN alias
            // 'E' is added to _nameIndex in the factory (see _DN_ALIASES).

            // ── X.509 Extensions (RFC 5280) ──────────────────────────────────────────
            '2.5.29.14':  { name: 'subjectKeyIdentifier',         shortName: 'subjectKeyIdentifier',        category: 'x509-extension' },
            '2.5.29.15':  { name: 'keyUsage',                     shortName: 'keyUsage',                    category: 'x509-extension' },
            '2.5.29.16':  { name: 'privateKeyUsagePeriod',        shortName: 'privateKeyUsagePeriod',       category: 'x509-extension' },
            '2.5.29.17':  { name: 'subjectAltName',               shortName: 'subjectAltName',              category: 'x509-extension' },
            '2.5.29.18':  { name: 'issuerAltName',                shortName: 'issuerAltName',               category: 'x509-extension' },
            '2.5.29.19':  { name: 'basicConstraints',             shortName: 'basicConstraints',            category: 'x509-extension' },
            '2.5.29.20':  { name: 'cRLNumber',                    shortName: 'cRLNumber',                   category: 'x509-extension' },
            '2.5.29.21':  { name: 'reasonCode',                   shortName: 'reasonCode',                  category: 'x509-extension' },
            '2.5.29.23':  { name: 'holdInstructionCode',          shortName: 'holdInstructionCode',         category: 'x509-extension' },
            '2.5.29.24':  { name: 'invalidityDate',               shortName: 'invalidityDate',              category: 'x509-extension' },
            '2.5.29.27':  { name: 'deltaCRLIndicator',            shortName: 'deltaCRLIndicator',           category: 'x509-extension' },
            '2.5.29.28':  { name: 'issuingDistributionPoint',     shortName: 'issuingDistributionPoint',    category: 'x509-extension' },
            '2.5.29.31':  { name: 'crlDistributionPoints',        shortName: 'cRLDistributionPoints',       category: 'x509-extension' },
            '2.5.29.32':  { name: 'certificatePolicies',          shortName: 'certificatePolicies',         category: 'x509-extension' },
            '2.5.29.33':  { name: 'policyMappings',               shortName: 'policyMappings',              category: 'x509-extension' },
            '2.5.29.35':  { name: 'authorityKeyIdentifier',       shortName: 'authorityKeyIdentifier',      category: 'x509-extension' },
            '2.5.29.36':  { name: 'policyConstraints',            shortName: 'policyConstraints',           category: 'x509-extension' },
            '2.5.29.37':  { name: 'extendedKeyUsage',             shortName: 'extendedKeyUsage',            category: 'x509-extension' },
            '1.3.6.1.5.5.7.1.1':  { name: 'authorityInformationAccess', shortName: 'authorityInformationAccess', category: 'x509-extension' },
            '1.3.6.1.5.5.7.1.11': { name: 'subjectInformationAccess',   shortName: 'subjectInformationAccess',   category: 'x509-extension' },
            '2.5.29.54':  { name: 'inhibitAnyPolicy',             shortName: 'inhibitAnyPolicy',            category: 'x509-extension' },

            // ── Extended Key Usage values (RFC 5280 §4.2.1.12) ───────────────────────
            '1.3.6.1.5.5.7.3.1':  { name: 'serverAuth',           shortName: 'serverAuth',      category: 'x509-eku' },
            '1.3.6.1.5.5.7.3.2':  { name: 'clientAuth',           shortName: 'clientAuth',      category: 'x509-eku' },
            '1.3.6.1.5.5.7.3.3':  { name: 'codeSigning',          shortName: 'codeSigning',     category: 'x509-eku' },
            '1.3.6.1.5.5.7.3.4':  { name: 'emailProtection',      shortName: 'emailProtection', category: 'x509-eku' },
            '1.3.6.1.5.5.7.3.8':  { name: 'timeStamping',         shortName: 'timeStamping',    category: 'x509-eku' },
            '1.3.6.1.5.5.7.3.9':  { name: 'OCSPSigning',          shortName: 'OCSPSigning',     category: 'x509-eku' },

            // ── PAdES / ETSI EN 319 142 / TS 102 778 ────────────────────────────────
            '0.4.0.19122.1':     { name: 'id-etsi-es-ades-commitment-type-signed-data', shortName: 'padesSignedData',   category: 'pades' },
            '0.4.0.2023.1.1':    { name: 'id-etsi-ades-pades',             shortName: 'pades',                category: 'pades' },
            '0.4.0.19122.2.1':   { name: 'id-etsi-ades-pades-b',           shortName: 'pades-b',              category: 'pades' },
            '0.4.0.19122.2.2':   { name: 'id-etsi-ades-pades-t',           shortName: 'pades-t',              category: 'pades' },
            '0.4.0.19122.2.3':   { name: 'id-etsi-ades-pades-lt',          shortName: 'pades-lt',             category: 'pades' },
            '0.4.0.19122.2.4':   { name: 'id-etsi-ades-pades-lta',         shortName: 'pades-lta',            category: 'pades' },
            '1.2.840.113583.1.1.8':  { name: 'adbe-revocationInfoArchival', shortName: 'revocationInfoArchival', category: 'pades' },
            '0.4.0.17090.1.1':   { name: 'id-etsi-qcs-QcCompliance',       shortName: 'QcCompliance',         category: 'pades' },
            '0.4.0.17090.1.2':   { name: 'id-etsi-qcs-QcLimitValue',       shortName: 'QcLimitValue',         category: 'pades' },
            '0.4.0.17090.1.3':   { name: 'id-etsi-qcs-QcRetentionPeriod',  shortName: 'QcRetentionPeriod',    category: 'pades' },
            '0.4.0.17090.1.4':   { name: 'id-etsi-qcs-QcSSCD',             shortName: 'QcSSCD',               category: 'pades' },
            '0.4.0.17090.1.5':   { name: 'id-etsi-qcs-QcPDS',              shortName: 'QcPDS',                category: 'pades' },
            '0.4.0.17090.1.6':   { name: 'id-etsi-qcs-QcType',             shortName: 'QcType',               category: 'pades' },
            '1.2.840.113549.1.9.16.2.15': { name: 'id-aa-ets-sigPolicyId',   shortName: 'sigPolicyId',   category: 'pades' },
            '1.2.840.113549.1.9.16.2.16': { name: 'id-aa-ets-commitmentType', shortName: 'commitmentType', category: 'pades' },
            '1.2.840.113549.1.9.16.2.18': { name: 'id-aa-ets-signerAttr',    shortName: 'signerAttr',    category: 'pades' },
            '1.2.840.113549.1.9.16.2.20': { name: 'id-aa-ets-otherSigCert',  shortName: 'otherSigCert',  category: 'pades' },
            '1.2.840.113549.1.9.16.2.21': { name: 'id-aa-ets-contentTimestamp', shortName: 'contentTimestamp', category: 'pades' },

            // ── ECC Curves (ANSI X9.62 / SEC2 / RFC 5480) ───────────────────────────
            '1.2.840.10045.3.1.1':  { name: 'prime192v1',    shortName: 'P-192',        category: 'ecc-curve', curve: 'P-192' },
            '1.2.840.10045.3.1.7':  { name: 'prime256v1',    shortName: 'P-256',        category: 'ecc-curve', curve: 'P-256' },
            '1.3.132.0.34':         { name: 'secp384r1',     shortName: 'P-384',        category: 'ecc-curve', curve: 'P-384' },
            '1.3.132.0.35':         { name: 'secp521r1',     shortName: 'P-521',        category: 'ecc-curve', curve: 'P-521' },
            '1.3.132.0.10':         { name: 'secp256k1',     shortName: 'secp256k1',    category: 'ecc-curve', curve: 'secp256k1' },
            '1.3.132.0.1':          { name: 'sect163k1',     shortName: 'sect163k1',    category: 'ecc-curve', curve: 'sect163k1' },
            '1.3.36.3.3.2.8.1.1.7':  { name: 'brainpoolP256r1', shortName: 'brainpoolP256r1', category: 'ecc-curve', curve: 'brainpoolP256r1' },
            '1.3.36.3.3.2.8.1.1.11': { name: 'brainpoolP384r1', shortName: 'brainpoolP384r1', category: 'ecc-curve', curve: 'brainpoolP384r1' },
            '1.3.36.3.3.2.8.1.1.13': { name: 'brainpoolP512r1', shortName: 'brainpoolP512r1', category: 'ecc-curve', curve: 'brainpoolP512r1' },
            '1.3.101.110':          { name: 'X25519',          shortName: 'X25519',       category: 'ecc-curve', curve: 'X25519' },
            '1.3.101.111':          { name: 'X448',             shortName: 'X448',         category: 'ecc-curve', curve: 'X448' },
            '1.3.101.112':          { name: 'Ed25519',          shortName: 'Ed25519',      category: 'ecc-curve', curve: 'Ed25519' },
            '1.3.101.113':          { name: 'Ed448',             shortName: 'Ed448',        category: 'ecc-curve', curve: 'Ed448' },

            // ── ECC Public Key (RFC 5480 / ANSI X9.62 - SPKI algorithm identifier) ──
            '1.2.840.10045.2.1':    { name: 'ecPublicKey',      shortName: 'ecc',              category: 'pkcs1' },

            // ── ECC Signature algorithms (RFC 5480 / ANSI X9.62) ────────────────────
            '1.2.840.10045.4.1':    { name: 'ecdsaWithSHA1',    shortName: 'ecdsaWithSHA1',   category: 'pkcs1', hashAlg: 'sha-1',   sigAlg: 'ecdsa' },
            '1.2.840.10045.4.3.1':  { name: 'ecdsaWithSHA224',  shortName: 'ecdsaWithSHA224', category: 'pkcs1', hashAlg: 'sha-224', sigAlg: 'ecdsa' },
            '1.2.840.10045.4.3.2':  { name: 'ecdsaWithSHA256',  shortName: 'ecdsaWithSHA256', category: 'pkcs1', hashAlg: 'sha-256', sigAlg: 'ecdsa' },
            '1.2.840.10045.4.3.3':  { name: 'ecdsaWithSHA384',  shortName: 'ecdsaWithSHA384', category: 'pkcs1', hashAlg: 'sha-384', sigAlg: 'ecdsa' },
            '1.2.840.10045.4.3.4':  { name: 'ecdsaWithSHA512',  shortName: 'ecdsaWithSHA512', category: 'pkcs1', hashAlg: 'sha-512', sigAlg: 'ecdsa' },
            // Note: Ed25519 (1.3.101.112) and Ed448 (1.3.101.113) - RFC 8410
            // specifies that the same OID is used both for the public key and
            // for the EdDSA signature algorithm. The entries are declared in
            // the "ECC Curves" section above (category: 'ecc-curve'); the
            // lookup returns the curve entry which suffices to identify the
            // algorithm on the X.509 parsing side. Do not redeclare here
            // (silent key collision in JS).

            // ── PKCS#5 / PBKDF2 / PBES2 (RFC 2898 / RFC 8018) ──────────────────────
            '1.2.840.113549.1.5.1':  { name: 'pbeWithMD2AndDES-CBC',      shortName: 'pbeWithMD2AndDES',  category: 'pkcs5' },
            '1.2.840.113549.1.5.3':  { name: 'pbeWithMD5AndDES-CBC',      shortName: 'pbeWithMD5AndDES',  category: 'pkcs5' },
            '1.2.840.113549.1.5.4':  { name: 'pbeWithMD2And40BitRC2-CBC', shortName: 'pbeWithMD2AndRC2',  category: 'pkcs5' },
            '1.2.840.113549.1.5.6':  { name: 'pbeWithMD5And40BitRC2-CBC', shortName: 'pbeWithMD5AndRC2',  category: 'pkcs5' },
            '1.2.840.113549.1.5.10': { name: 'pbeWithSHA1AndDES-CBC',     shortName: 'pbeWithSHA1AndDES', category: 'pkcs5' },
            '1.2.840.113549.1.5.11': { name: 'pbeWithSHA1And40BitRC2-CBC', shortName: 'pbeWithSHA1AndRC2', category: 'pkcs5' },
            '1.2.840.113549.1.5.12': { name: 'pbkdf2',                    shortName: 'pbkdf2',            category: 'pkcs5' },
            '1.2.840.113549.1.5.13': { name: 'pbes2',                     shortName: 'pbes2',             category: 'pkcs5' },
            '1.2.840.113549.1.5.14': { name: 'pbmac1',                    shortName: 'pbmac1',            category: 'pkcs5' },

            // ── AES OIDs (NIST / FIPS 197 + SP 800-38) ──────────────────────────────
            // AES-128 - NIST CSOR arc: ECB=1, CBC=2, OFB=3, CFB=4, wrap=5, GCM=6, CCM=7
            '2.16.840.1.101.3.4.1.1':  { name: 'aes128-ECB',  shortName: 'aes128-ecb', category: 'aes', keyLen: 128, mode: 'ecb' },
            '2.16.840.1.101.3.4.1.2':  { name: 'aes128-CBC',  shortName: 'aes128-cbc', category: 'aes', keyLen: 128, mode: 'cbc' },
            '2.16.840.1.101.3.4.1.3':  { name: 'aes128-OFB',  shortName: 'aes128-ofb', category: 'aes', keyLen: 128, mode: 'ofb' },
            '2.16.840.1.101.3.4.1.4':  { name: 'aes128-CFB',  shortName: 'aes128-cfb', category: 'aes', keyLen: 128, mode: 'cfb' },
            '2.16.840.1.101.3.4.1.5':  { name: 'aes128-wrap', shortName: 'aes128-kw',  category: 'aes', keyLen: 128, mode: 'kw' },
            '2.16.840.1.101.3.4.1.6':  { name: 'aes128-GCM',  shortName: 'aes128-gcm', category: 'aes', keyLen: 128, mode: 'gcm' },
            '2.16.840.1.101.3.4.1.7':  { name: 'aes128-CCM',  shortName: 'aes128-ccm', category: 'aes', keyLen: 128, mode: 'ccm' },
            // AES-192 - ECB=21, CBC=22, OFB=23, CFB=24, wrap=25, GCM=26, CCM=27
            '2.16.840.1.101.3.4.1.21': { name: 'aes192-ECB',  shortName: 'aes192-ecb', category: 'aes', keyLen: 192, mode: 'ecb' },
            '2.16.840.1.101.3.4.1.22': { name: 'aes192-CBC',  shortName: 'aes192-cbc', category: 'aes', keyLen: 192, mode: 'cbc' },
            '2.16.840.1.101.3.4.1.23': { name: 'aes192-OFB',  shortName: 'aes192-ofb', category: 'aes', keyLen: 192, mode: 'ofb' },
            '2.16.840.1.101.3.4.1.24': { name: 'aes192-CFB',  shortName: 'aes192-cfb', category: 'aes', keyLen: 192, mode: 'cfb' },
            '2.16.840.1.101.3.4.1.25': { name: 'aes192-wrap', shortName: 'aes192-kw',  category: 'aes', keyLen: 192, mode: 'kw' },
            '2.16.840.1.101.3.4.1.26': { name: 'aes192-GCM',  shortName: 'aes192-gcm', category: 'aes', keyLen: 192, mode: 'gcm' },
            '2.16.840.1.101.3.4.1.27': { name: 'aes192-CCM',  shortName: 'aes192-ccm', category: 'aes', keyLen: 192, mode: 'ccm' },
            // AES-256 - ECB=41, CBC=42, OFB=43, CFB=44, wrap=45, GCM=46, CCM=47
            '2.16.840.1.101.3.4.1.41': { name: 'aes256-ECB',  shortName: 'aes256-ecb', category: 'aes', keyLen: 256, mode: 'ecb' },
            '2.16.840.1.101.3.4.1.42': { name: 'aes256-CBC',  shortName: 'aes256-cbc', category: 'aes', keyLen: 256, mode: 'cbc' },
            '2.16.840.1.101.3.4.1.43': { name: 'aes256-OFB',  shortName: 'aes256-ofb', category: 'aes', keyLen: 256, mode: 'ofb' },
            '2.16.840.1.101.3.4.1.44': { name: 'aes256-CFB',  shortName: 'aes256-cfb', category: 'aes', keyLen: 256, mode: 'cfb' },
            '2.16.840.1.101.3.4.1.45': { name: 'aes256-wrap', shortName: 'aes256-kw',  category: 'aes', keyLen: 256, mode: 'kw' },
            '2.16.840.1.101.3.4.1.46': { name: 'aes256-GCM',  shortName: 'aes256-gcm', category: 'aes', keyLen: 256, mode: 'gcm' },
            '2.16.840.1.101.3.4.1.47': { name: 'aes256-CCM',  shortName: 'aes256-ccm', category: 'aes', keyLen: 256, mode: 'ccm' },

            // ── PKCS#12 (RFC 7292) ───────────────────────────────────────────────────
            '1.2.840.113549.1.12.1.1':  { name: 'pbeWithSHA1And128BitRC4',    shortName: 'pbeWithSHA1RC4-128', category: 'pkcs12' },
            '1.2.840.113549.1.12.1.2':  { name: 'pbeWithSHA1And40BitRC4',     shortName: 'pbeWithSHA1RC4-40',  category: 'pkcs12' },
            '1.2.840.113549.1.12.1.3':  { name: 'pbeWithSHA1And3-KeyTripleDES-CBC', shortName: 'pbeWithSHA13DES', category: 'pkcs12' },
            '1.2.840.113549.1.12.10.1.1': { name: 'pkcs12-keyBag',            shortName: 'keyBag',          category: 'pkcs12' },
            '1.2.840.113549.1.12.10.1.2': { name: 'pkcs12-pkcs8ShroudedKeyBag', shortName: 'pkcs8ShroudedKeyBag', category: 'pkcs12' },
            '1.2.840.113549.1.12.10.1.3': { name: 'pkcs12-certBag',           shortName: 'certBag',         category: 'pkcs12' },
            '1.2.840.113549.1.12.10.1.4': { name: 'pkcs12-crlBag',            shortName: 'crlBag',          category: 'pkcs12' },
            '1.2.840.113549.1.12.10.1.5': { name: 'pkcs12-secretBag',         shortName: 'secretBag',       category: 'pkcs12' },
            '1.2.840.113549.1.12.10.1.6': { name: 'pkcs12-safeContentsBag',   shortName: 'safeContentsBag', category: 'pkcs12' },

            // ── OCSP / CRL (RFC 2560 / 6960) ─────────────────────────────────────────
            '1.3.6.1.5.5.7.48.1':  { name: 'ocsp',                shortName: 'ocsp',            category: 'x509-extension' },
            '1.3.6.1.5.5.7.48.2':  { name: 'caIssuers',           shortName: 'caIssuers',       category: 'x509-extension' },
            '1.3.6.1.5.5.7.48.3':  { name: 'timeStamping',        shortName: 'timestampingUri', category: 'x509-extension' },

            // ── TSA / OCSP response content types ────────────────────────────────────
            '1.2.840.113549.1.9.16.1.4':  { name: 'id-smime-ct-TSTInfo',    shortName: 'tstInfo',       category: 'pkcs7' },
            '1.3.6.1.5.5.7.48.1.1':      { name: 'id-pkix-ocsp-basic',      shortName: 'ocspBasic',     category: 'pkcs7' },

            // ── Miscellaneous / well-known ────────────────────────────────────────────
            '1.2.840.113549.1.9.16.3.8':  { name: 'id-alg-CMS3DESwrap',  shortName: 'CMS3DESwrap',  category: 'pkcs7' },
            '2.16.840.1.101.3.4.1':       { name: 'nistAlgorithms',       shortName: 'nistAlgorithms', category: 'aes' },
            '1.2.840.113549':              { name: 'rsadsi',               shortName: 'rsadsi',        category: 'pkcs1' },
            '1.2.840.113549.1':            { name: 'pkcs',                 shortName: 'pkcs',          category: 'pkcs1' },
            '2.5.4.0':  { name: 'objectClass',             shortName: 'objectClass',     category: 'x509-dn' },
            '2.5.4.49': { name: 'distinguishedName',        shortName: 'distinguishedName', category: 'x509-dn' },
            '2.5.4.97': { name: 'organizationIdentifier',   shortName: 'organizationIdentifier', category: 'x509-dn' },

            // ── Netscape extensions ──────────────────────────────────────────────────
            '2.16.840.1.113730.1.1':  { name: 'netscape-cert-type',    shortName: 'nsCertType',    category: 'x509-extension' },
            '2.16.840.1.113730.1.12': { name: 'netscape-ssl-server-name', shortName: 'nsSSLServerName', category: 'x509-extension' },
            '2.16.840.1.113730.1.13': { name: 'netscape-comment',      shortName: 'nsComment',     category: 'x509-extension' },
        };

        /** @type {RegExp} OID format validator - numeric arcs separated by dots. */
        const _OID_RE = /^\d+(\.\d+)*$/;

        /**
         * Normalised reverse index: both `name` and `shortName` map to the OID
         * string, so that `byName` is case-insensitive for either form.
         * Built once at factory call-time.
         */
        const _nameIndex = /** @type {Map<string, string>} */ (new Map());
        for (const [oidStr, entry] of Object.entries(OID_DATABASE)) {
            _nameIndex.set(entry.name.toLowerCase(), oidStr);
            _nameIndex.set(entry.shortName.toLowerCase(), oidStr);
        }

        // X.509 DN shortName aliases for OIDs whose primary category is not
        // 'x509-dn' but which are conventionally used as DN attributes
        // (RFC 4519/5280). Order matters: later sets override earlier ones,
        // but here aliases are distinct from any existing shortName.
        const _DN_ALIASES = /** @type {Array<[string, string]>} */ ([
            ['e',            '1.2.840.113549.1.9.1'], // emailAddress (PKCS#9 RDN)
        ]);
        for (const [alias, oidStr] of _DN_ALIASES) {
            if (!_nameIndex.has(alias)) _nameIndex.set(alias, oidStr);
        }

        /**
         * Look up an OID string and return its metadata entry, or `null` if
         * the OID is unknown or the input is not a valid OID string.
         *
         * Never throws - malformed input returns `null`.
         *
         * @param {string} oidStr - Dotted-notation OID, e.g. `'1.2.840.113549.1.7.2'`
         * @returns {OidEntry|null}
         */
        function lookup(oidStr) {
            if (typeof oidStr !== 'string') return null;
            if (!_OID_RE.test(oidStr)) return null;
            return OID_DATABASE[oidStr] ?? null;
        }

        /**
         * Reverse-lookup: given a name (canonical `name` or `shortName`, any
         * case), return the OID string, or `null` if unknown.
         *
         * @param {string} nameOrShortName
         * @returns {string|null}
         */
        function byName(nameOrShortName) {
            if (typeof nameOrShortName !== 'string') return null;
            return _nameIndex.get(nameOrShortName.toLowerCase()) ?? null;
        }

        /**
         * Return all OID entries belonging to a given category as an array
         * of `{ oid, ...entry }` objects.
         *
         * @param {string} category - e.g. `'pkcs7'`, `'x509-dn'`, `'ecc-curve'`
         * @returns {Array<{ oid: string } & OidEntry>}
         */
        function findByCategory(category) {
            const out = [];
            for (const [oidStr, entry] of Object.entries(OID_DATABASE)) {
                if (entry.category === category) {
                    out.push({ oid: oidStr, ...entry });
                }
            }
            return out;
        }

        return { lookup, byName, findByCategory, OID_DATABASE };
    }
};
