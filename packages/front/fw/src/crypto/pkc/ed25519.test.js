// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { ed25519 } from './ed25519.js';
import { sha512 } from '../hash/sha512.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _hex = hex.factory();
const _sha512 = sha512.factory(_ba, _utf8);
const _ed = ed25519.factory(_sha512, _ba);

const fromHex = (s) => _hex.toBytes(s);
const toHex = (u8) => _hex.fromBytes(u8);

describe('ed25519 module (RFC 8032)', () => {

    test('module metadata', () => {
        expect(ed25519.name).toBe('ed25519');
        expect(ed25519.dependencies).toEqual(['sha512', 'bitArray']);
    });

    // RFC 8032 §7.1 - Test 1
    test('§7.1 TEST 1 (empty message)', () => {
        const seed = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
        const expectedPub = 'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a';
        const expectedSig =
            'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b';

        const kp = _ed.keyPair(seed);
        expect(toHex(kp.publicKey)).toBe(expectedPub);
        const sig = _ed.sign(kp.privateKey, new Uint8Array(0));
        expect(toHex(sig)).toBe(expectedSig);
        expect(_ed.verify(kp.publicKey, new Uint8Array(0), sig)).toBe(true);
    });

    // RFC 8032 §7.1 - Test 2 (single-byte message)
    test('§7.1 TEST 2 (1-byte message)', () => {
        const seed = fromHex('4ccd089b28ff96da9db6c346ec114e0f5b8a319f35aba624da8cf6ed4fb8a6fb');
        const msg = fromHex('72');
        const expectedSig =
            '92a009a9f0d4cab8720e820b5f642540a2b27b5416503f8fb3762223ebdb69da085ac1e43e15996e458f3613d0f11d8c387b2eaeb4302aeeb00d291612bb0c00';

        const kp = _ed.keyPair(seed);
        const sig = _ed.sign(kp.privateKey, msg);
        expect(toHex(sig)).toBe(expectedSig);
        expect(_ed.verify(kp.publicKey, msg, sig)).toBe(true);
    });

    // RFC 8032 §7.1 - Test 3 (2-byte message)
    test('§7.1 TEST 3 (2-byte message)', () => {
        const seed = fromHex('c5aa8df43f9f837bedb7442f31dcb7b166d38535076f094b85ce3a2e0b4458f7');
        const msg = fromHex('af82');
        const expectedSig =
            '6291d657deec24024827e69c3abe01a30ce548a284743a445e3680d7db5ac3ac18ff9b538d16f290ae67f760984dc6594a7c15e9716ed28dc027beceea1ec40a';
        const kp = _ed.keyPair(seed);
        const sig = _ed.sign(kp.privateKey, msg);
        expect(toHex(sig)).toBe(expectedSig);
        expect(_ed.verify(kp.publicKey, msg, sig)).toBe(true);
    });

    test('verify rejects modified message', () => {
        const seed = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
        const kp = _ed.keyPair(seed);
        const msg = new TextEncoder().encode('original');
        const sig = _ed.sign(kp.privateKey, msg);
        const tampered = new TextEncoder().encode('Original');
        expect(_ed.verify(kp.publicKey, tampered, sig)).toBe(false);
    });

    test('verify rejects modified signature', () => {
        const seed = fromHex('9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60');
        const kp = _ed.keyPair(seed);
        const msg = new TextEncoder().encode('hello');
        const sig = _ed.sign(kp.privateKey, msg);
        sig[0] ^= 1;
        expect(_ed.verify(kp.publicKey, msg, sig)).toBe(false);
    });

    test('rejects bad seed length', () => {
        expect(_ed.keyPair(new Uint8Array(31))).toBe(false);
    });
});


// ============================================================================
// EDDSA-ACVP (FIPS 186-5 §7 / RFC 8032) -- NIST CAVP byte-exact coverage
// ----------------------------------------------------------------------------
// Sources (references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/):
//   EDDSA-KeyGen-1.0   -- 3/3 ED-25519 vectors (validator: keyPair(d).publicKey == q)
//   EDDSA-KeyVer-1.0   -- 4/4 ED-25519 vectors (mix pass/fail; via _internal.isValidPublicKey)
//   EDDSA-SigGen-1.0   -- ED-25519 / preHash=False / AFT [first, mid, last] = 3 sub-samples
//                         (d from internalProjection.json -- ACVP server-secret debug-level export)
//   EDDSA-SigVer-1.0   -- 10/10 ED-25519 / preHash=False vectors (5 AFT + 5 AFT, mix pass/fail)
//
// Out of scope (documented in ed25519.acvp.md):
//   - Ed448 (different curve, SHAKE-256, not implemented)
//   - Ed25519ph (preHash=True; requires dom2 prefix, not implemented)
//   - context byte-string (RFC 8032 Ed25519ctx; not exposed in our API)
//   - EDDSA-SigGen BFT groups (32-test stress; AFT covers correctness)
// ============================================================================

const _KG_ED = [
    { tg: 1, tc: 1, d: '19165F660A63D78678924F2685FC0E868CFF1C8969A1889E30705A425D7D9869', q: '1B2D8A0851500FBEF13B18AE3E0A418D45BB803B1635012C906DDC96519C83F4' },
    { tg: 1, tc: 2, d: '640CA510093F24625B8E43289D35B6DF0E7B34365344796EDD08AFB3D08CB874', q: '9929129EF72FE01841D2DF2B75C80E8A5095EFD5758CAC6352731282832A5B7D' },
    { tg: 1, tc: 3, d: '76564304E0BC04E32F65568894D01662C5FCB3AFCD77705A6447C767BBB5DEEA', q: 'EDEE7099AE2C4476CF78C9728E7A23E20DA651FEB2F2AF9734096A4DC7AB4CBF' }
];

const _KV_ED = [
    { tg: 1, tc: 1, q: '5BC0D8831F8D7FB200E32DAF36C54BF2808E69D40BD48BD915DF585B2696C166', pass: false },
    { tg: 1, tc: 2, q: 'CF1BD87814E4113E9CAB4D5B95A4F85EA04BAC9EB70053023B1D201A85225072', pass: true },
    { tg: 1, tc: 3, q: 'EB0E59A5D0EC784B3EFC7E5A86DFBD244789E5B384A652A43DC0968974E83571', pass: true },
    { tg: 1, tc: 4, q: 'FBB4F7945F521A5CB169883477E9DFAFA14767FD4D973D8FD3667C46253F5943', pass: false }
];

const _SG_ED = [
    { tg: 1, tc: 1, d: '60B9C57EA605C9147656883781ED28C847682FAA3C7AD8FBE2FD9DAF263C803C', msg: 'F495660A1FC6A591B0E2FB90574E3A28E485152ECF6C5745C137E2C53E619832D58A5F101B3EEAF88887DF1552AB16613E87AA4F38C91453A5824809BE2E198FF84E3C6EAF79AF8FD44EF7E4C0FDC70941A0F457F1908011F80E89CBCEBE47806C9F131AB5580132DE9BE0B9DB0D622F4D16C805AE852F0B68F1C6B1AB8E2BB4', sig: 'F9593859640FD47FA3A67F6CF00184B9696A2928F0013A72411325D7356AF72460C26DDEB3B6A6C1BC89224179F72F75C8E3BE6D2F9EF6002F29BCE680C0B203' },
    { tg: 1, tc: 6, d: '60B9C57EA605C9147656883781ED28C847682FAA3C7AD8FBE2FD9DAF263C803C', msg: 'D369D566B676D0E904E6B3E9131F134A966ABBE064FB87F6A5C1F85C6D69CD1EC0D9C4E16E910A33D54716C1926DB545DF592B62F0D07E974B43F8C1AAA5301BA84557C864F3A4C1CCABB0E293D2399D82A2029E85756417A128D41252D7DE862AA994CB0A37E7E1F8B0D854E720C020564A98892C5BC53C1161004CD49C71A4', sig: 'C3E9B9A3C5B909B51E265A2B0EF45AADE817656829F1949D5B424105151516C86088536C077864B1605D9FA936925F17943C6C8DD5A34C4B0D5EA907B00B460A' },
    { tg: 1, tc: 10, d: '60B9C57EA605C9147656883781ED28C847682FAA3C7AD8FBE2FD9DAF263C803C', msg: 'ADA10A8B44F99A0BB6F24945E7E07313833A5B5FEC444C70B6E1F6919C9838069AF878288398DFF9816FD3F582B17F7B3953B5A5D23CC426CA8E2424F31B7A89E7CCF6665CAD6638DF2E9CB16B16FEDA05E9AD172120D2905FD4D5E9D1BF271D213E0B818C8465E66AD6C5A5CD23FBA078F5E31B399CC8F34D82EBC194D10FA5', sig: '390D70C93699BE9084328646EECE105C1B323152B1FB4D82BF87753A6DC15032E723815053CD1E7AE2E08650DFDE5CF433B701957AFA42F0C6F296A8C26D070D' }
];

const _SV_ED = [
    { tg: 1, tc: 1, q: '745EA92E8A785DD7BF72F70B3CAD17BE04F966F33DFB8382AA7856305A61D97A', msg: 'DB37C7A01F6534E762ECF81F2C27294667215C9EA699808CF8C61EFD86475D7036B52CCF09587F5FDB24B676EBAFCDE708A617886794BF0806D1F89EC50F0B1862E4CFF90E32EC7EAAC33266A2875DF065E30C9260BF5505AF3B01F6D729230D8B58FE49A032CB15387748BC996F4408C7CFC8E81D9771602D6F2CD94825F6F3', sig: '190295502CA30A54FCE82D67ED8F18B89F0B300769BBEF8DD42F4BA75260658246916A6191391815111932CE1FDFAE705474434D11EA4E8B7DB02E8AE47D9B00', pass: true },
    { tg: 1, tc: 2, q: 'C7204C7C14A49D7D9975AD72D8715505A09B1DE1F4D528B32CF86DF9D5C66554', msg: '148614C89C0F94E39B73CCCC2ED89DC30E3ADB2595EDF05F3D96DEC7FD5ECA6B34AFE018F3DA907B1C2D08B373AFBED6E6D419B7BC6872F59E07A32D8AB011A4263F7CEDAF839728F2988D07E28E66E0C468780F02F0ABB09C909C8B028313AA35EB42D990823F5EE31CA867180E853A92A6B09E5B469069190C6FEFE27B449A', sig: '548E36D06A4D6579348D3E64CC9219CE39CBE8D67540D544274C7141EEF77CD90F41495CB236F3FC1ED1C0B6E8C4E330E8411A09B06AF3F8CD2AABB8F4CC4CC5', pass: false },
    { tg: 1, tc: 3, q: 'B9C11DC381084D66E5A7A658B451137D99F2685B7271FB4360F08619CBC1CEAB', msg: '827FE0AEF3879332BBB51019F171E6E5EDF96E6DA29C293E3C3BFBCEAD8DD3D3D78EF223A13816DEF032E732B270EA5FCC69C1453DCDB075A381E609658365A2E7C389DBD1B24EAF3FAB3B5212CDBF23456151122FBB976169C4D5F0E8558A2C85F9FF72932FC11E7CF101D42F1A3A7971CF5FEFB0EA9BE7361D0B92D0CBA140', sig: '96692E768052A8248F5A0A86FE5E1D9460722D49E449E57348F3C5FEE965511AD998D04E03AE7D4ABAAA8255824A9D6C9A6A00471F70D56638EB73795E066A0B', pass: false },
    { tg: 1, tc: 4, q: 'FF6DE18F3FAA19FD5DE7CD5ED880FEC3F29649DDAB0C3C03F09E21BD5B737E52', msg: 'AF3B1077344A64D07BC6BE08C59BCDDC586928E2A4E9D531C6768F6C9C7B2D26FDF650C76B305026A82A39F552669C4003B990A3FA6DC7FF027BA884700DFBB5BC106E62DBD096E80C23506BE9D8AC6EFBFF799731E9366C582B9701195C49F89622CDFED497407D50C28C31D91F2B9A7DC2E1B90691D7890F43F91B4DE6AB99', sig: 'F09C9088560368D515113969576FFA22DD726D9AC840FAE1CE1B2668D31BC640B97AEC9AF405B96B49A61A98F3BA3D4BC24869C59D78F1560B97DF575208740D', pass: false },
    { tg: 1, tc: 5, q: '5B34B40E8D08EB94EB48649EF78C0E242B8968C4EF370FCB71B0EA05CDA6977A', msg: '3A189E375111E26F305D33AA4881F75DCC11DB997EBEC5B466A6E06A4FD3F09209C14FFB96DE5B6251160839F1F73035D7B86BCBB61F4889143515AC743486399725A278B7CE1637DC92B8C648D9E97C53549ED50D87B7AB3906CAAC1538F509DD5012DB73838A768D78526ECA8290DEE22BE4693D638AA90016FC4145A3B02F', sig: '1DB56BA5A586D21FBD87D3B9E77EBF11FCD8A744A924FD7686B99BFD8E23351106648206E7BD71F239663976FA7A6855841EE8A09C03B37D768B66363AF8F6F4', pass: false }
];

describe('EDDSA-KeyGen-1.0 (NIST CAVP, ED-25519, 3/3 vectors)', () => {
    test.each(_KG_ED)(
        'tgId=$tg tcId=$tc: keyPair(d).publicKey == q',
        (v) => {
            const seed = fromHex(v.d);
            const kp = _ed.keyPair(seed);
            expect(kp).not.toBe(false);
            expect(toHex(kp.publicKey).toLowerCase()).toBe(v.q.toLowerCase());
        }
    );
});

describe('EDDSA-KeyVer-1.0 (NIST CAVP, ED-25519, 4/4 vectors)', () => {
    test.each(_KV_ED)(
        'tgId=$tg tcId=$tc (expected=$pass): _internal.isValidPublicKey(q)',
        (v) => {
            const ok = _ed._internal.isValidPublicKey(fromHex(v.q));
            expect(ok).toBe(v.pass);
        }
    );
});

describe('EDDSA-SigGen-1.0 (NIST CAVP, ED-25519, byte-exact 3 sub-samples)', () => {
    test.each(_SG_ED)(
        'tgId=$tg tcId=$tc: sign(d, msg) == signature',
        (v) => {
            const seed = fromHex(v.d);
            const kp = _ed.keyPair(seed);
            const msg = fromHex(v.msg);
            const sig = _ed.sign(kp.privateKey, msg);
            expect(toHex(sig).toLowerCase()).toBe(v.sig.toLowerCase());
        },
        20_000
    );
});

describe('EDDSA-SigVer-1.0 (NIST CAVP, ED-25519, 10/10 vectors)', () => {
    test.each(_SV_ED)(
        'tgId=$tg tcId=$tc (expected=$pass): verify(q, msg, sig)',
        (v) => {
            const ok = _ed.verify(fromHex(v.q), fromHex(v.msg), fromHex(v.sig));
            expect(ok).toBe(v.pass);
        },
        20_000
    );
});


// ============================================================================
// EDDSA preHash (Ed25519ph) ACVP - iteration E1 of the FIPS 140-3 upgrade plan
// ----------------------------------------------------------------------------
// Sources:
//   EDDSA-SigGen-1.0 ED-25519 / preHash=True: 2 groups × {10, 32} tests AFT
//                                              (sub-sample 3 = 6 vectors)
//   EDDSA-SigVer-1.0 ED-25519 / preHash=True: 1 group × 5 tests (mix valid/invalid)
//
// API tested: `signPh(privateKey, message, context)` and
//             `verifyPh(publicKey, message, signature, context)`
// (raw message - Ed25519ph applies SHA-512 internally per RFC 8032 §5.1.1)
// ============================================================================

const _PH_SIGGEN = [
    { tg: 2, tc: 11, d: '2AF03E7691051D68C7423E541D62B99983C21207F18AC0226681F01B4C26A7CD', msg: 'E6BD522FB23AAB7C0628E12F40FACA29C1DB25A23E5C978F09FF8839F9727728C8438B3AEB51E96CEC1C4C95ED7C0E32715723E5B20B6071F83D819BA6989952BECFAC4F2C3B81E5C0D8AD9ECE8FCC8A9B2ED192C436F77492B7766C36A9459ABB1A25BA07AA6143EAE81CAA80F2296EA9B745EC33546DE489B3F98D7E6BCEDC', ctx: 'E7E7CA4F58B5061F8CAC39A85A2CDD5525C4DDD240DEF77FA0AAEBBD7A252199C25BAAE2451E43A91A564D90A0A4F3619E162A82BB305092CA106D9B5F2075D93CD94D4E8D7C6B4F4799029070C28F0E464ADEF0FE5E730FA9385EB16D8A431D', sig: '7B10B072B07B5896C0FCCF620F3F699EB348761AD9B33B82CC073FE6E79592BCA46F3FF3316653BD4086F5D14818E96AF7B2B5DFE22C387D7167C1CD1FF21709' },
    { tg: 2, tc: 16, d: '2AF03E7691051D68C7423E541D62B99983C21207F18AC0226681F01B4C26A7CD', msg: '68AB53643E7887A2C2FB2CE3C3D946FCE86C44116E2340B0C4C64C8DE649DD3D01A49E979427D9CC224454E51420E938A0A7E68EE905170743E78C1844AAE616E04003AD12E7A3CEFA2D17852A849751DF9038CC5FBE7E0451B17E37F6D4F93AC97E69AC71C8C9D974464D680A69B8C21F83ED3EE4B0954AEC7475DBC0171547', ctx: 'FDDF6639E520410800B4E57362785989219614077CD47A312AA50BFE6BFAD2BF37CD8C26B199401BD7544B36C9AAE18F0084B6889E42D2890617D3263B185D4BEAAE1E4307590ED71EB24A4F5E8049FDCB4617C946BC6E5610947FC0715FCD21A3AAB612A8ACD6174DFD450C99E31D86D84585093A01F6A0C1C7F0DE715CD563BFE4327C062143515051CA3D5D2F1D0172F11C46C28C05D627BC34EBFE2669183AA23BB6E48F77F58B489640D71D5DF5B3EF04DA750F06FA9B170C7D16CE9AE691A25ABA24D0F076CC9156C887A0ED333A4ABA980CFBBB955D6087D4064386E2111EE0C551983F6D8711D630A4635B22EB12C19DB1AB0472', sig: '42773DD61D113B6B6E8E518CA81778731A16920A745037E4374ABA2B764998120FF8F2BBE63BBBD87AAED1E4C54BA94623317E3D198D39BF2F36FA7DCB3DFC01' },
    { tg: 2, tc: 20, d: '2AF03E7691051D68C7423E541D62B99983C21207F18AC0226681F01B4C26A7CD', msg: '052A34BFDD873D0C1355086F144A51DD250DA33668FA8E8913410270E03A121843B9D655E8369AB8F3CB7871C35164BCF64CDA585A3CF3DC7F1CF5784031D78CC7CBC079064729FF66FD735BD60EA608BA43A1B8C6D9E30433DD9D123501B667264F7F6A5A1FFF9704A1323E4126B91D2F2A7AF798FDDB46351A9806DF2EA098', ctx: 'B9866BA04542F939', sig: 'E5862AB43D63D645E81091268C0C80F4BB5AF086D4D6391C98E5FBF94D2F84EE9C3F3763DD08EDE96B3DC72C2384D575CD84288F93AE3A6374D944F1AC2C3E05' }
];

const _PH_SIGVER = [
    { tg: 2, tc: 6, q: 'E744F13F78C291EDCE122E15E71E1B0BC03518A945A435D9BF800D9205CA666C', msg: '7BF2B740E8F098CC998CCA26910DCD7594A70243F8A4AF795CDE31C249C81D8C22E6DA0F7CAD1F7F4F9C444C58FBACA784C6B20CEBD64A560134EE086FE768DDD822213DB5523B47B3ED1A42FBB1AD4BE6A0A9B2A6F6AF44249062B8F5D36C69DE3FFD054692472D7858029B1B6EE664EDE3DBDC50471DD62868D0FC7FB4A0B6', sig: '92AEF3D134DBF0A4A886DA3DBEF6F00288B3CBF737CAC11CD0691394999003CFDDCA059D5D1A844259835D08B6D5DA819C552C995E9CB2F2461486594260F200', pass: false, reason: 'modify message' },
    { tg: 2, tc: 7, q: '44A974BC2F0B1C17F75D5C92FEA810032395880D23C8BB6A099B5B771DBBAB51', msg: '01736A29F0C9E7422F269A9E4688ABA137E6FDA73EB93C3FC4669C8BFC3855FA48A7D2C3F7DFE60D3D8650FE9FD08E699E0E3DB627A1BCD3366209D7D724C87F25396ED4F149B0749D2548FB8D73A1CD3E73B0C5B87B33B77CC30CA75484328681DD71409ECCDD4ED3F5315B583997430A5D5B0AAA495D967A0DA1CE98846ACE', sig: '171DA6472FF3F9FF2406BB33FB2C692E698836D18D962B501888820D887C383B03A21DA7D6A36C319704E55616D711252F9E2E348AD9E07B3C5E80B44F6AB9E3', pass: false, reason: 'modify r' },
    { tg: 2, tc: 8, q: '59502F445C12E2B9C9B7977B39DFD938846AE5029ABC407F09407B7379196622', msg: 'E18E2D3986923B050B9428695C9BC1943B11CF9F134EDD53F54A72AB2F32872F05629D937092F513B59132A2708ED9D72B5BC40873B0F07E219ECC7CA5F0973D3799F83672ECEFFF1A434F03CDFFF2C2C6189CC670BFC9FD98108060920F560595FFA26350A0EFC72134C73DAE898EA1FF5F8CFCF62D3DDAFD49D662B41134E1', sig: '64F0C05DF644B5A2377018D58D5F76E3C1EEBA72D46A1149B8C987E7A1AC644107DDABE88690F26D40D711D0979C7386A5462CB7DF090AE037F4CB948831A4DA', pass: false, reason: 'modify s' },
    { tg: 2, tc: 9, q: 'F1B3596C5E9316D9FD5E981D757D7D762F8D411E0B9398DE04FD6958DDC618BB', msg: '3B9A32B103F077CB44F4B4D1B8A2DDC5D82D95AE0BC0743246A23E71A38E3297D327B71030CCA2B278423A2383DC3D32AF13C79C4D742EF2AB627DA5A2EF0D7F1738AEF6D58CD9A0CAE32239B21F94C448E061B10E4ACF811D8C9D096C6C959B7BED4217A1861210C4D6E61DF64B7F486BEA12378B896D5A4F4F7CE79C9D76B1', sig: '8C40F3C271B6F191AB4166B38EF46674966C22AE36C95E51185ABD0876F4D2B39CD253B5AFF3EB544B97BBB54ACE84F285B3A8CDE53200E7D5F91A69CB251A0D', pass: false, reason: 'modify key' },
    { tg: 2, tc: 10, q: '9B4D6B4D333D30928F8B5379676DD6B64E4F9D0AD2F4B610FC4313F32FBD0E55', msg: '2227D29DD370703C7177310894EE8969870FC48BF2DA3E5DEF6A73889B23125C2D6B618A363BC41613328CA6BB87C2101DFF1DD339DDE684B108D99787846EFD1EED9057FFA669A4E2FD69D95EF066C902FA0C09203049BEC260319FE0A7147C0BEB972250C50B29093E04839CA8E5E3A8BA3E9B0079E8B50FE11C0AD072E2E7', sig: '6E462589DC20F73A61EAD929D468E1CBC74E7ABF858F723974A36D95858AE8EC449FFFF878DB8AC6409395C1B6AE2D36A684140C81C8982CD025171FFB58470E', pass: true, reason: 'none' }
];

describe('EDDSA-SigGen-1.0 preHash=True (NIST CAVP, Ed25519ph iteration E1)', () => {
    test.each(_PH_SIGGEN)(
        'tgId=$tg tcId=$tc: signPh(d, msg, ctx) == signature byte-exact',
        (v) => {
            const seed = fromHex(v.d);
            const kp = _ed.keyPair(seed);
            expect(kp).not.toBe(false);
            const msg = fromHex(v.msg);
            const ctx = v.ctx ? fromHex(v.ctx) : new Uint8Array(0);
            const sig = _ed.signPh(kp.privateKey, msg, ctx);
            expect(sig).not.toBe(false);
            expect(toHex(sig).toLowerCase()).toBe(v.sig.toLowerCase());
        }, 30_000
    );
});

describe('EDDSA-SigVer-1.0 preHash=True (NIST CAVP, Ed25519ph iteration E1)', () => {
    test.each(_PH_SIGVER)(
        'tgId=$tg tcId=$tc (expected=$pass, reason=$reason): verifyPh(q, msg, sig)',
        (v) => {
            const ok = _ed.verifyPh(fromHex(v.q), fromHex(v.msg), fromHex(v.sig));
            expect(ok).toBe(v.pass);
        }, 20_000
    );
});

describe('Ed25519ctx (RFC 8032 §5.1, iteration E1)', () => {
    // Ed25519ctx requires a non-empty context (1..255 bytes). RFC 8032 vectors
    // for ctx are sparse; we exercise the round-trip and the dom2 binding.
    const SEED = fromHex('0303030303030303030303030303030303030303030303030303030303030303');
    const kp = _ed.keyPair(SEED);

    test('signCtx + verifyCtx round-trip with same context', () => {
        const msg = new TextEncoder().encode('hello ed25519ctx');
        const ctx = new TextEncoder().encode('test-context');
        const sig = _ed.signCtx(kp.privateKey, msg, ctx);
        expect(sig).not.toBe(false);
        expect(_ed.verifyCtx(kp.publicKey, msg, sig, ctx)).toBe(true);
    });

    test('verifyCtx rejects with wrong context', () => {
        const msg = new TextEncoder().encode('hello ed25519ctx');
        const ctxA = new TextEncoder().encode('ctx-A');
        const ctxB = new TextEncoder().encode('ctx-B');
        const sig = _ed.signCtx(kp.privateKey, msg, ctxA);
        expect(_ed.verifyCtx(kp.publicKey, msg, sig, ctxB)).toBe(false);
    });

    test('verifyCtx rejects when verifying with verify() (pure path)', () => {
        const msg = new TextEncoder().encode('hello');
        const ctx = new TextEncoder().encode('ctx');
        const sig = _ed.signCtx(kp.privateKey, msg, ctx);
        // Ed25519ctx signature is NOT valid under pure Ed25519 verify (different dom prefix).
        expect(_ed.verify(kp.publicKey, msg, sig)).toBe(false);
    });

    test('signCtx rejects empty context (use sign() for pure Ed25519)', () => {
        const msg = new TextEncoder().encode('m');
        expect(_ed.signCtx(kp.privateKey, msg, new Uint8Array(0))).toBe(false);
    });

    test('signCtx rejects context > 255 bytes', () => {
        const msg = new TextEncoder().encode('m');
        expect(_ed.signCtx(kp.privateKey, msg, new Uint8Array(256))).toBe(false);
    });
});

describe('Ed25519ph cross-check (round-trip and domain separation)', () => {
    const SEED = fromHex('0404040404040404040404040404040404040404040404040404040404040404');
    const kp = _ed.keyPair(SEED);

    test('signPh + verifyPh round-trip without context', () => {
        const msg = new TextEncoder().encode('the quick brown fox');
        const sig = _ed.signPh(kp.privateKey, msg);
        expect(sig).not.toBe(false);
        expect(_ed.verifyPh(kp.publicKey, msg, sig)).toBe(true);
    });

    test('signPh + verifyPh round-trip with context', () => {
        const msg = new TextEncoder().encode('the quick brown fox');
        const ctx = new TextEncoder().encode('app-prefix-1');
        const sig = _ed.signPh(kp.privateKey, msg, ctx);
        expect(_ed.verifyPh(kp.publicKey, msg, sig, ctx)).toBe(true);
    });

    test('Ed25519ph signature ≠ pure Ed25519 signature on same message', () => {
        const msg = new TextEncoder().encode('domain separation test');
        const sigPure = _ed.sign(kp.privateKey, msg);
        const sigPh = _ed.signPh(kp.privateKey, msg);
        expect(toHex(sigPure)).not.toBe(toHex(sigPh));
    });

    test('verifyPh rejects pure Ed25519 signature', () => {
        const msg = new TextEncoder().encode('cross-mode rejection');
        const sigPure = _ed.sign(kp.privateKey, msg);
        expect(_ed.verifyPh(kp.publicKey, msg, sigPure)).toBe(false);
    });

    test('signPh rejects context > 255 bytes', () => {
        expect(_ed.signPh(kp.privateKey, new Uint8Array(0), new Uint8Array(256))).toBe(false);
    });
});


// ============================================================================
// Ed448 explicit reject (Iteration E2 of the FIPS 140-3 upgrade plan)
// ----------------------------------------------------------------------------
// FIPS 186-5 §7.7 admits Ed448 (edwards448 curve + SHAKE-256). Our module
// only implements Ed25519. The stubs `ed25519.ed448.{keyPair, sign, verify,
// signPh, verifyPh}` return `false` + `console.warn('NOT-IMPLEMENTED')`
// to prevent any silent usage of an Ed448 function.
// ============================================================================

describe('Ed448 explicit reject (E2)', () => {
    test('ed448.keyPair returns false (NOT-IMPLEMENTED)', () => {
        expect(_ed.ed448.keyPair(new Uint8Array(57))).toBe(false);
    });

    test('ed448.sign returns false', () => {
        expect(_ed.ed448.sign(new Uint8Array(114), new Uint8Array(0))).toBe(false);
    });

    test('ed448.verify returns false', () => {
        expect(_ed.ed448.verify(new Uint8Array(57), new Uint8Array(0), new Uint8Array(114))).toBe(false);
    });

    test('ed448.signPh returns false', () => {
        expect(_ed.ed448.signPh(new Uint8Array(114), new Uint8Array(0))).toBe(false);
    });

    test('ed448.verifyPh returns false', () => {
        expect(_ed.ed448.verifyPh(new Uint8Array(57), new Uint8Array(0), new Uint8Array(114))).toBe(false);
    });

    test('ed448 namespace shape: { keyPair, sign, verify, signPh, verifyPh }', () => {
        for (const k of ['keyPair', 'sign', 'verify', 'signPh', 'verifyPh']) {
            expect(typeof _ed.ed448[k]).toBe('function');
        }
    });
});
