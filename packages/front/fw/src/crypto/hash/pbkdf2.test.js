// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect } from 'bun:test';
import { pbkdf2 } from './pbkdf2.js';
import { hmac } from './hmac.js';
import { sha256 } from './sha256.js';
import { bitArray } from '../utils/bitArray.js';
import { utf8 } from '../../io/codec/utf8.js';
import { hex } from '../../io/codec/hex.js';

const _ba = bitArray.factory();
const _utf8 = utf8.factory();
const _hex = hex.factory();
const _sha256 = sha256.factory(_ba, _utf8);
const _hmac = hmac.factory(_ba, _utf8, _sha256);
const _pbkdf2 = pbkdf2.factory(_ba, _utf8, _hmac);

const toHex = (ba) => _hex.fromBytes(_ba.ba_to_ui8(ba));

describe('pbkdf2 module', () => {

    test('module metadata', () => {
        expect(pbkdf2.name).toBe('pbkdf2');
        expect(pbkdf2.dependencies).toEqual(['bitArray', 'utf8', 'hmac']);
    });

    describe('PBKDF2-HMAC-SHA-256 vectors (RFC 7914-style)', () => {
        // Vectors derived from the de-facto PBKDF2-HMAC-SHA-256 reference set.
        test('P="password", S="salt", c=1, dkLen=256 bits', () => {
            const dk = _pbkdf2('password', 'salt', 1, 256);
            expect(toHex(dk))
                .toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
        });

        test('P="password", S="salt", c=2, dkLen=256 bits', () => {
            const dk = _pbkdf2('password', 'salt', 2, 256);
            expect(toHex(dk))
                .toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
        });

        test('P="password", S="salt", c=4096, dkLen=256 bits', () => {
            const dk = _pbkdf2('password', 'salt', 4096, 256);
            expect(toHex(dk))
                .toBe('c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a');
        });

        test('P="passwordPASSWORDpassword", S="saltSALTsaltSALTsaltSALTsaltSALTsalt", c=4096, dkLen=320 bits', () => {
            const dk = _pbkdf2(
                'passwordPASSWORDpassword',
                'saltSALTsaltSALTsaltSALTsaltSALTsalt',
                4096,
                320
            );
            expect(toHex(dk))
                .toBe('348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9');
        });
    });

    describe('input handling', () => {
        // Two 600000-iteration derivations: ~6-7 s under whole-suite load, which
        // overruns bun's 5 s per-test default. Explicit timeout, not a shortcut --
        // the work is inherently slow, so the default is what is wrong here.
        test('default count (600000) is applied when count omitted', () => {
            const a = _pbkdf2('p', 's', undefined, 128);
            const b = _pbkdf2('p', 's', _pbkdf2.DEFAULT_COUNT, 128);
            expect(toHex(a)).toBe(toHex(b));
            expect(_pbkdf2.DEFAULT_COUNT).toBe(600000);
        }, 30000);

        test('derive() alias matches callable form', () => {
            expect(toHex(_pbkdf2.derive('p', 's', 1, 128)))
                .toBe(toHex(_pbkdf2('p', 's', 1, 128)));
        });

        test('output length 128 → 4 × 32-bit words', () => {
            const dk = _pbkdf2('p', 's', 1, 128);
            expect(_ba.bitLength(dk)).toBe(128);
        });

        test('rejects negative count', () => {
            expect(_pbkdf2('p', 's', -1, 128)).toBe(false);
        });

        test('rejects negative length', () => {
            expect(_pbkdf2('p', 's', 1, -1)).toBe(false);
        });
    });
});


// ============================================================================
// PBKDF-1.0 (NIST CAVP PBKDF2 vectors -- SP 800-132)
// ----------------------------------------------------------------------------
// Source: references/NIST/ACVP-Server-1.1.0.42/gen-val/json-files/PBKDF-1.0/
// Coverage strategy:
//   - 1 testGroup x 50 AFT vectors, hmacAlg=SHA2-224 (only PRF exposed
//     by PBKDF-1.0; ACVP does not currently cover SHA-256/384/512 PBKDF2
//     in this revision -- our existing reference vectors for HMAC-SHA-256
//     above remain authoritative for that PRF).
//   - Sub-sample every 2nd vector => 25 vectors. Sum iterationCount =
//     135077 (~15s wall-time in pure-JS HMAC-SHA-224).
//   - keyLen in bits (112..560), salt 16-32 bytes, password 8-32 chars,
//     iterationCount 1..10000 -- exercises both 1-iteration KAT (anchor)
//     and high-iteration count (saturation).
//   - pbkdf2.js defaults to HMAC-SHA-256: instantiate HMAC-SHA-224 inline
//     and pass as the trailing Prff arg.
// ============================================================================

const _sha224_pbk = (await import('./sha224.js')).sha224.factory(_sha256);
const _hmac224_pbk = hmac.factory(_ba, _utf8, _sha224_pbk);

const PBKDF_AFT = [
    { tg: 1, tc: 1, kl: 560, ic: 9776, salt: '59312599E8FD2478253203BAA255F587632B44BCBA0B1E71EEB80108B2FCE080897ED3C840561C347D35EEA6F1', pw: 'SrsQVnQvjZoVFdGvwujo', dk: '1D5878F597094CFD38A81F0BBD9FD815339654356667EFC8D6F8F5EA29504C80F7B88932E297C17C679111FDE14410D35CC6C4B67193F9E960CC65D979896862DC26E40E8102' },
    { tg: 1, tc: 3, kl: 880, ic: 7334, salt: '8CA692EFF42AC2BCA731DA4A2DEDBE3F9EBCC3A94DE1C2F77723CFECCD9BBE824C3FB5FBD4ABFA10D14CA79CFAB09FE597A6A10D58', pw: 'BIYxKlgMSFK', dk: '94D5A3D2D4C6F000AA7D6AD56DE6AFDC9B3BF64BD65F10D7A0CB3203CD2D1BA54674A8C6F1B15FEC8A049F9E8CE2EE9939E285BE45E5D52410D6FD13F18C99CA3BCD2B5C87D4FC238B235A7AE400C5EB23EE2F44C69C5F4F6D443D4EB19CC968E2640DB20861D9A4418ECB0494D8' },
    { tg: 1, tc: 5, kl: 680, ic: 1402, salt: '85E59EE31C4702AD3A4BAF1852A3C97BD8115B17B6BC469F225C8A', pw: 'QZlajvgQyW', dk: 'C548263D4670C1087BD163EA260F797E93857B1B114B0F47321528D740EAE86E34F0913B965FC2D36039DF490F8BA5564C369410D1DDAE16DF4992D31BA76CBCCA862E2C98206062929E1058B4552C444F78296EAD' },
    { tg: 1, tc: 7, kl: 496, ic: 1045, salt: 'BC0F2ACAADF2049516878B1AF50AA1281E363E25277C695C422A1281111E10058CCF', pw: 'uhrdDKLrKRxkrYZrjal', dk: 'A74C12DB2C8157FAF61B83B95E9CD5CDA327DA62DBB6321C7729EA7DC89A6CE3BF498B8B0AB6F2A7031AE4F3D99AC22C3F1C782165CB9E396A40BD19F9A7' },
    { tg: 1, tc: 9, kl: 2000, ic: 5114, salt: 'E102687290CB8FCA60579B20037023AF1C2EBF65A2B90D442B42B293A1955A55D36D0A0EE415145CF3B505AC6D06FCA8B52C582763ADB4EB', pw: 'uhdrquFVQqwmZWalSrvxSVEInQEzzIyeqSIgXiRrcw', dk: '3F88BA847D182930BFF925BDB94FA752DFA93AEA7B98095607595A2D43FDB2F8CE1B06E12E5D234F8FA3E2601F8A91D9FB29AE7E5E787BF025B13032EB04F2F4FC179C753F61668696EEE5BA4A94D0AA5F779E5FD124513DF387865CA6285DAA0B7068BF207BF82B695449EA23608BEC88E92DCB2693910C9C80EF7E71066BEBE5BEB9E0380D3001579AAABA1BC3D7021AC83F801ED2B645822F1B91502EDB848E52F9329606CAACED7C2EC2533109CE620E4010C976DBBAD671F13DACE8B3D1FBEDF2B7AF3966CDC37AB1A2CD6F0F548D180F5B18461D507A3A8493A0EEC7AACA7D656A4F812F0E9427F6047A28361ED7B4736B583D144C4815' },
    { tg: 1, tc: 11, kl: 1936, ic: 2581, salt: 'E647EAFC2148B3DFE07D772317A926570F9E3882F0BE594613D804F97F02DA01FC1B653A130C09FB4F30BABA76354274D4', pw: 'cTgcjdkOypOFyUKLFDJOaGM', dk: 'E5E8E59D97BDE2952F2D1945DE3CB1A17B0FE5165A800AB0540A3C8597E434EE0C818727F676E0D66349A68E72EDA365225422409967CF85E6AFD5D03933F725570D12B0A919CF3018711B4962C60DA879A7D9DAC99BE8FD45FEF310376F7AE8251F200258C25EA54CD80C35D352C4AB40D123894278E2F0946C58E3F632EF54BACC7598DE079429CEEDC43B496F7AD464E60DF7BF7801AC1ADE66969011085D066C16F14BC96C53E84FD1FD6EAF19F547142AEEBA1002600283D5B0C8CF262E0667E3C6E95AF73C7F5CB24AA2A0A8066A1AF59B51EBE81E7CDA636DB8B5F65E3F56F0EA0462CF3AB03F0A1DDCE632E2055F' },
    { tg: 1, tc: 13, kl: 872, ic: 7656, salt: 'A43C70543213757DBFD0180DB179ADCD8BF9126F31AAE661BE0F7833B28D10905FBB2E536CC555B9DA21', pw: 'LUnttZOPVpgCUbWJdVqVUvuauXcEVoBdQnRtJsme', dk: '690F0DBB7F2E1B1BF38435B5D49B06876E7766A15EF6AAC7721AA46E1A16E04B6A2771B08673B23FBC4C077E2E77A9C776BDA1CB5BAA3F240ED323A0B8275F859BF4EC241297EE12544DD2FE892F890BB5C52E94D822C496DA94B03086D65BF99CE9AF9196E57F6C030BD1F6B9' },
    { tg: 1, tc: 15, kl: 1272, ic: 9875, salt: 'A1112792371F55D67543FAE3D4C39CDF8A1FADD57CFC8EEBAC91017623A18E6FC1C7BDD00870CA957A01186EFC10008BDF40D9B9C0284E5FE1300301B4D0D78D', pw: 'KxPzpVxqXxioJUqmPsQeWcbbT', dk: 'BE0F3B52BC92F2D86F0EB2AE8D63623BC23393FAA4ACB47343F05AEB358E64332822604C2CA70F6767BDC7B14873FB86F3627D3E34878BEA0395FD46E577D6E473218208E99E44BD181D12CAF839357814B39C684A51CD5E21ACF08278CA76A76DE8262F27D6ECE11B3291200C3CCF6A9F5C994AC5256D587573E9342F62B5E1A356478D5FBF3C33CD6C7EF5378355364ACEB2C4BC2FC2EBB765AAC4B87AF5' },
    { tg: 1, tc: 17, kl: 1008, ic: 10000, salt: '20FB06FB7FA60C78EED204A1412AB2461124E2099FF7CBC8CDD51EE091DC5BB1B977300A128DC5A0C08E3276BE9EC21094CE0773122BD95006188944', pw: 'fYNngoSRgSfFOjuBASObaebKprUVYQqBczVQjZmFIqyEWPdlxwBbqNNaW', dk: '64F53CE9455796A53FE425F545079D5190DE5A29C76B2F4FC51920B26DCC53510F04A928EB0ED8666CD49D99ABDCF8CF6093A4A729985BD0331966822BC4E0D3F3F6D45C1676A5328BBDA37D7ABCFC062FCAB006E84C5FB929E8DA3223DE810A6D946E7A52A2493F65E90FF1A75EDB8B425DA18F1A0137EEC3EE975D193E' },
    { tg: 1, tc: 19, kl: 2040, ic: 1915, salt: '5C4A86D51F6BCA85ED4199BFA99F9416AB6D379B78DE36CC0E4EABCC29361C5DB7298AE1987F60B515CA919F4EB403', pw: 'qJEYEPLgszHEbzrjJfOYfrQeKbGeUckXbQKoOOLLzROduBJowAYZFKjYTzoC', dk: '027E035F5C0B83D07BA6FD0F223A84E2F08D92F42DDDDBFE74A42813DBE8A018D24F6A6A41075C18AD8923C23D09EF80BE8E726F9314AE17B42E6053E3761938583A376AFB018D30313410DD23C4863873ED3C5C72678B0A823114B6BCEF93EA0A4EB3FDD5A0EA44EA76F3BF9DD15964155FB599F9E77552948C59E369157221F316B0F9AAB88A74BFA981F2A02E45F5CE4518FC0395E83F4E8CFB96EBCA38EC9C83E62BE8458C6725E0A515AFB1E0A822942BB0FC35ADAB3F0F2D8455F0E01C3E04AFAD62861B906544D4249CD06713CB7C46EECC37F5A9FF0E6712D1A35D74BD0502E8C646D0BBBF577ACDFA4C4DA46895A331E1F969CA75A7BDFF9D6F8C' },
    { tg: 1, tc: 21, kl: 1488, ic: 6481, salt: 'B3E76C6382EEFD327D3835C93FD4E221', pw: 'TxzUDZTFnpEZbbYLIKgmEITPRPaDyNacCGLOHkravSoclgAJTsNcJPqkDK', dk: '85E9D30B8E2CCA06A584FF4CDD2A0E2A6224E586045D8C73E8DA11FB1241D09947053E69E543DF8501845894D5DBF99C468F7F15C30ECCE081FA045BA7CCEFDE972C943799BD03742F51B35C3766B2C64015545E2996BACDEBA99D39F9FDAB608C2CE09B06F27A4A39C286BBFBE9D3ACA7A8A7F9F552C3CAA122131653C6FF805D36353F5A16CA8709AD2C279CF65E89E6CEBF9BA18719D0C85A0166580B8EE335CC296FC6378B0CFCEF3694913C24A414092F459360EF757964' },
    { tg: 1, tc: 23, kl: 1800, ic: 4285, salt: '3D0F9BFD2F415735A79F2F22A1D3BC50A34FBB2BC66EE1106631E045B8E914C576230F3ADCED186CE0A1A8AEABAE1DEB6294', pw: 'VeUjaZUVMuorUSquVkyxirHvmqhwCOFUjSEqXuWzqjutLIpLRzFc', dk: 'C48FB9BC0A572EB866F7F53F5C6DD6F8F1F990A80AF62C9548685857B436897B4D53C6CFC70D7A8655781AB4D35F9D43E0455F8DB102C4BD6AFBB76B7DDD4F971C278DB4343B0C493F7D74619C2E69BF0E6345A831BCDFA164AB846E91D8F3CB2518763166B33B0C941DE666DA5492F90B2111213F71F4E0830CFB2DFD5CC12F025924D826B36B1CA117F96A3D8FA004B4FDBB5EF86BE2132EA2BD1934FE96DB9BA2E18EBE1DB4730C590E2E74CAE9DCD056B95FFCE8C8536DFE2CFF1D11BAB55859E8D7179F9F8131999EB0ADC7F77EB72142EB1E74957A5B1430A06AF7B633B6' },
    { tg: 1, tc: 25, kl: 992, ic: 2570, salt: 'FCD2E68B5D8DC2FF6794B68B368FC0614D4915A847CF0CDFDB8894A6DDFDAC8C37B0515964E980653834C252F45C6EF45B7DC31959E2214D2C', pw: 'aapedTPoABhSFZGVAPlomOnypdikJJZs', dk: '3A25771860C951E8CF4682073801E03CCB36B1BF9C1016AFD2838CA6B58C3F60D538AAAB9B42AF9AC13E406452E2BF08291B0C6D3082294BCE60346B41E9C4666D790C181683A7BCBAD70DBFA20940211170DCF87F929252ACFC3DDEAAABA72C18832964681EEA43B12A9313AC923E5C17CFEC485EDE5FE733D25D62' },
    { tg: 1, tc: 27, kl: 248, ic: 3279, salt: 'DAAA83DD5D07776F338189B13AFCDADB8A172B7C0DEDF9595BD0C9F10AEE34954E', pw: 'lKVgUrIsnyCyMBfZkhCoxzEYFSfOxPtVctLbekgySwZjAkLyupjjUHxLfWB', dk: 'CB400BA8310E147319E7C73A809F332645D09EAF0CD1C052EB08A3F6A28D43' },
    { tg: 1, tc: 29, kl: 768, ic: 9873, salt: 'D1B69637860A05D0B8911DF90E8AC15FCDA9ABA0DBCD369E', pw: 'cVwzPYAwjjGDcwXByHxQczskdMqEDHsTbCAwaODWLwKnpwpgCuQgKj', dk: 'D0745F5DD51F0A974F92E31B73B03DC0B10DC6D04734A768A8CF03E33A4CA324AEC22E7D3277E072AA72C3FB9C06621782BD129A4231C3FAEBB6F0D3E0E953570B9245604B1D84BEF2A0C5F9403ECFEAA548C33AE8CCED56E6A59C4A54843665' },
    { tg: 1, tc: 31, kl: 696, ic: 6965, salt: 'B6C94A2275FF500842D823C44375AFD816BBA90D3662F35D7C4955A4142933A51BD372CD57B4CF65AC0C19139C3A6BD2F6676A0538391C2897A1D74564', pw: 'ZkgJabzJzHfEbGGXVN', dk: 'C38C32B3746AE9BC6C56A45F2C059B8B3EDB725156DA141F5ED7FD83FBF146816D3D2EC2200EA780F7D6ABD95E0DDFFCFDD26E4E39A15C6A05D98A38C51F02DF404000718269FE4A121A21CAD345D321481C77A79E27B2' },
    { tg: 1, tc: 33, kl: 1312, ic: 183, salt: '8DC5260EEB7963E58748849523D06D9C78E1D738FEC15A759747A5F348D259F35500DCAA114CD176C05931777D1F7D7C07887A72D98310', pw: 'xzqnWzPMhYXWukxWeyiUwazRYBjsQmM', dk: '557367B204C70E5549CE5FB3EE317B62D1F1ED8C52D785E5F32F5FF0B3EF22FC1C63854C4B2DEE6D1C5EC1249787E6C4FABC39BC41CE97AE7C631CB731DE8E347EB82D6EEB193E17ECF8AA58A11D9E31AE7C57D873ABB95F831C053E16F979BAC6C6E2D81E1E0C4EBF8C470EEB6C77F47F5F5A225F4262DA93634A3718015DCB41A2C827B07E48B51C1BE08FE7452C81EA9F4AD48FCE6F5167CBA5C4AD9213AE7D671330' },
    { tg: 1, tc: 35, kl: 1792, ic: 6329, salt: 'A5F80D63FD41AA8397AEEAB25A45F6009C5CB1EC4C55CF03E439D6AE7CCFDC7E', pw: 'luHcoGzWqlClMgiKnrrwfQlwXXgcZReMTsVsnNZ', dk: 'CC763C1A6E676AF943DE314820DDF29EAE1DE76D3D56EEC58E7A95A1AD76F04BD1A735A60EB50D5C4B627CC534CE89EAA46CDBA744B9FE86F81A0CE690B7B43FDEADA9E15CE2102A9405BD255E804AA1CCFB563DDBB56BA0351378BC90A30B7BF97F17273E8C54C58B8E94F79F6EFF8662AB987528365C53BB7B20E846F29FF49A2A033D11523568A9B1846AD97BB59F5549317C389C7735DAEF2E3ED1DD527CE7A5F98F1582ACE30432ABD5491ED6DF2158E4349D3CFB8DDD7F917935810C3B64D5A91CEA1632561237AB19D18258E39A3C848D2D69D8CF51523D4624AD48EF' },
    { tg: 1, tc: 37, kl: 112, ic: 8444, salt: '6B7E773ED89844835128BE617895AE1ED8619E311D8D5954F7E3C14BA1F0380DC64CCF82AFB57B', pw: 'azxMuoaGPkoDSEPzcfuGTMCLgqNUTrVqN', dk: 'A1234AC86A60E30A975DFC843269' },
    { tg: 1, tc: 39, kl: 1840, ic: 5862, salt: 'DDF7F85DCC017C64362615A1527696F1243EA9AD498BC9F6C782657321D91995C135EF8231B1', pw: 'XhEtmjRNAphfjgpjGVnyrqfK', dk: 'A01FE907C53EF388C3E6FFED761FC89B28EA2DFA375B84243CA596851F87E5ABEEBB04A9830740867E9327DF458BE25A680FA63D67804F4909ACC07EDB2916D9E5181F041597FCDB7DC8A7F16C898AA8C782A35E4E27995EFDAFE5E7D3CF1250652521ABD490C992D9F4D59DE7A4D5F4A33B2631B6C5C2BB12B0B182001E781414E7D801849D418250B7C6928073E1A6581DD516A2868DE6E072AB062B09F7F4FEC2B29387B857FDE881F213EEAB24F6C57C084137970BFBCCA27BAD001FC96A99630A7FA7391F88B5F749F12C6720128F44D5C742F14EC3FD3E1A68C0126DCDE596CB65413B' },
    { tg: 1, tc: 41, kl: 424, ic: 8604, salt: 'C22D7E08C568FDE3B7DE9ABDE056D611B2D61366986DED2833541B64872EA42A10F38DA80111C73D940C3D4C27FEC6DA', pw: 'ZpLZqZiZxSSysnoyXhclLNiIFx', dk: '2E553C6DCD2FD724FE963EC03ABD9CC1344C7E6D26F833B5DA02B64ABEB45DEB8F93C8AC33B55F98C9A6D3BFB6E0443034CDC293B2' },
    { tg: 1, tc: 43, kl: 1184, ic: 3403, salt: '3EE3CD26BEC9F068A0F63F2BCF3BFEA9C3040EC46370847A3B97BFBBB66239A6A811446440FB1CE5A220A42EDA4B50351083F8434E7D6F82470D', pw: 'tmPFkASqcQYgLmxPoirhuhIZwmJJKBnTusNUlSfIBYrysCOHD', dk: '83F2475D579DEC08C25DF99C17F20F6B9296642811DF6362AA67EE4886986C2B2E3006B1142D227DC9D3047CC9B8681C524E513DAB1AC3396BF7E3B070182C28BE06D4688E52303BFBBC89AC2A168CD4B4AF382B26A3008F26265F25EB5A9FFF8D7B3119EF1EC680C23D1E18A6030694F6B3398249580D06334104906F3F890F0F81E60F363ACF67CBC9B42F709B821E4101B088' },
    { tg: 1, tc: 45, kl: 1392, ic: 2886, salt: '292BB7B4FE5C2175EE97D11AD66C0A8D8FDAC1C098EAC3', pw: 'HNcMGjDZLIljFEmTZbQgwIXIOBBTxtQiCvjuf', dk: '78EFBD7C97F56F87DC890A846B62B68A3C456AEEE8489EB0109EBED9C23A88789F5925D0CF0C76A895F976F989B69C201F9386CA88122777AF58372FBA0BA53CB203A9A6809E163B18094E818A01B34EEFB062A1D846B971875275D3074ABFDE855E4AD63D8E184D64F22454A8B8E18903CF95ABEFF7F3ED28A803482D32FDD18AEEE829C43A0F3752EEF5EA902DAECC6619C06C534E99DA0FEB6F4CF460254E3AF5D880D845E7380114D27CA8E1' },
    { tg: 1, tc: 47, kl: 1952, ic: 2886, salt: 'A0A20E9DA138BB7ADA40F1767CDC217D20E2156DEF5CEA6ADE742C880237B260C4BC847F3E4013CAE15B144FACC267C38366E07504237F24224CDD', pw: 'TQwJptHRvVZUNMxFfgDLDQoOyvyLAcriinmVWEjmFQnExrq', dk: 'F07DD64706A450C7ED12B94FD2BD9A07F78B614C34FCB11DDD32BC890D78F2E5CB47DD7E06697113F9237A68BD67497DBEF09C6B032B9DE49F21E239EAEA498A531A40754DA50FE5DB4DC5B3ABE13554406CFAB63D069347A530CB374E88373695F7345C05BF65D616F2480856524922275C16C40649EFA2B91A9FE874D10388B6B144D3D21DEEAFD7055BFD53C144F8D46F3933ACF2C697C05EF24D1790CEBD548607DC4C168BC89C040C266941BB4EC1CBD77C8D80CA2BD03527A0F6E7B05726F7AFA99263B0C015EA575D0AED4629762EA78DC8D0715597F5B970848BD470D4EB150F2D1A6AA5C358B6DEAFF2C89648C320AB' },
    { tg: 1, tc: 49, kl: 424, ic: 6329, salt: 'B6F354A93BB396B151B93C602E529F72BDBB0C661472D2E3FF2C6B6DE48A5B4E6D8FBA2BD0ABAFEF57934477E078C6698FB27A', pw: 'wduuZVYdihLMetmGocBxaAGsyWsthjGfohDvhEJRZUDJlkgCswm', dk: '6D46F2C5BCC88BB2402FBCB7ACAF86D66AEEA65DA68A7114FF466E579B217E28D9575B15B78C7EB1C9796A0C1A262E7789AE4D6DF7' }
];

describe('pbkdf2 - PBKDF-1.0 (NIST CAVP, HMAC-SHA-224, sub-sampled 1/2)', () => {
    test.each(PBKDF_AFT)('tgId=$tg tcId=$tc (HMAC-SHA-224, keyLen=$kl bits, iter=$ic)', (v) => {
        // Password is an ASCII string per ACVP spec; pbkdf2() accepts strings.
        const dk = _pbkdf2(v.pw, _ba.ui8_to_ba(_hex.toBytes(v.salt)), v.ic, v.kl, _hmac224_pbk);
        expect(toHex(dk)).toBe(v.dk.toLowerCase());
    }, 60_000);
});

// ── Iteration B4 (FIPS 140-3 upgrade plan) ────────────────────────────────
// PBKDF2 across the 10 HMAC families now supported (cf. iterations A1, A3,
// B1, B2). Reference outputs computed via Python `hashlib.pbkdf2_hmac()`
// and frozen as regression KATs (no NIST ACVP vectors exist for PBKDF2 with
// SHA-3 or SHA-512-truncated PRFs; PBKDF-1.0 only covers SHA-224).
//
// Each variant validates 5 representative cases:
//   (1) c=1, dkLen=32 B  - 1-iteration anchor
//   (2) c=4096, dkLen=32 B  - moderate iteration count (RFC 7914-style)
//   (3) c=4096, dkLen=40 B with long P+S - multi-block T(i) chain
//   (4) c=10, empty password - degenerate input
//   (5) c=2, dkLen=20 B (< HashLen for SHA-512 etc.) - T_1 truncation path
// ============================================================================

const _sha512_pbk = (await import('./sha512.js')).sha512.factory(_ba, _utf8);
const _sha384_pbk = (await import('./sha384.js')).sha384.factory(_sha512_pbk);
const _sha512_224_pbk = (await import('./sha512_224.js')).sha512_224.factory(_sha512_pbk);
const _sha512_256_pbk = (await import('./sha512_256.js')).sha512_256.factory(_sha512_pbk);
const _sha3_pbk = (await import('./sha3.js')).sha3.factory(_ba, _utf8);

const _hmac384_pbk     = hmac.factory(_ba, _utf8, _sha384_pbk);
const _hmac512_pbk     = hmac.factory(_ba, _utf8, _sha512_pbk);
const _hmac512_224_pbk = hmac.factory(_ba, _utf8, _sha512_224_pbk);
const _hmac512_256_pbk = hmac.factory(_ba, _utf8, _sha512_256_pbk);
const _hmac3_224_pbk   = hmac.factory(_ba, _utf8, _sha3_pbk.sha3_224_hash);
const _hmac3_256_pbk   = hmac.factory(_ba, _utf8, _sha3_pbk.sha3_256_hash);
const _hmac3_384_pbk   = hmac.factory(_ba, _utf8, _sha3_pbk.sha3_384_hash);
const _hmac3_512_pbk   = hmac.factory(_ba, _utf8, _sha3_pbk.sha3_512_hash);

describe('pbkdf2 - iteration B4 (10-family cross-check)', () => {

    describe('PBKDF2-HMAC-SHA2-256 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: '120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: 'c5e478d59288c841aa530db6845c4c8d962893a001ce4e11a4963873aa98134a' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '348c89dbcbd32b2f32d814b8116e84cf2b17347ebc1800181c4e2a1fb8dd53e1c635518c7dac47e9' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: '4c9d748ae0f9043b42a414cc80500da3' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: '1998f3d3f22119b7f9a77c8ae8b1df0d6e5dde8a' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA2-384 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: 'c0e14f06e49e32d73f9f52ddf1d0c5c7191609233631dadd76a567db42b78676' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: '559726be38db125bc85ed7895f6e3cf574c7a01c080c3447db1e8a76764deb3c' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '819143ad66df9a552559b9e131c52ae6c5c1b0eed18f4d283b8c5c9eaeb92b392c147cc2d2869d58' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: '3473ab4216ee91c10aaac551502bb5f7' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: '33ff1a10447fd575ca027fef471694a5fe5a6a05' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac384_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA2-512 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: '867f70cf1ade02cff3752599a3a53dc4af34c7a669815ae5d513554e1c8cf252' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: 'd197b1b33db0143e018b12f3d1d1479e6cdebdcc97c5c0f87f6902e072f457b5' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '8c0511f4c6e597c6ac6315d8f0362e225f3c501495ba23b868c005174dc4ee71115b59f9e60cd953' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: '1f7a48471674bc0dcdc3735b2ddc3509' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: '848f74be9002da07c6be2cb85f72ea25a0c8798d' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac512_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA2-512/224 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: 'b34ab626276a61ce19d2ecb4c7e15f8198a2989abd74ade61cd6b117812ff423' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: 'ed54af699cc307e08965098bda5ff4e41ea1931f46da771c1ea9128e52f91ade' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '573df96762ea7da4f71231859ca282ef482764ad9671c5275c3272fe6ae94d285a5709d1080fd6d8' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: '45ff5b3a966ee439708c02bdaf8d797a' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: 'cc69191b8129012e352be445a57b08a62fcd779f' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac512_224_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA2-512/256 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: '4b6a63117d3ec0032624616082c1c1912f56fa5f0c1f94574d515e20e5ddd74a' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: 'f2fbe5f8ec3618bb145279a8c6a8dfa476c282a3ed53d8c257d51ce021d3877d' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '31cf94e3d8e36aa18d40ad92654ab80f500ed7fb575a2215547db6f82dd227ed0f41215e8f9bb976' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: 'e1d035f810133b3d320bd8d09428a76a' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: 'e00539fd760940064d6c0253214338a2232fc778' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac512_256_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA3-224 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: 'd36cad0feea8cf942860130463093a623bead21f82366f184f318b4fd6b3c654' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: '691292bc3683d7d41ea2910f5b3eed239d5fec2c84606dfb136934b881ecf24f' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '00340fae2d7b57642248fde4835852cbbaaa865726550617ba6fb4bfede7e129bb916ae3ee9e7ff5' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: 'bb881e237d71aef567c233f99a999c9b' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: '367958b7a3927a17783003170fd6b7a3e2551276' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac3_224_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA3-256 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: '94613f3ee2ea730e0b06754f3fc816d4f87c9be9cbd8556b5d59b52330e333a8' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: '778b6e237a0f49621549ff70d218d2080756b9fb38d71b5d7ef447fa2254af61' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: '7aef8f1ad8c7f12205334f624d4af9e2863121618f7a0b3209bef3934801c39feac24ef0ac6a5c25' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: '62f4da8766e71a339cd11c60ec54a033' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: 'd15fbbb4c04a81cc42cfafd1091fe153926d900b' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac3_256_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA3-384 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: '7d7aba341e6ac84e9938f0f5a2f63c07daa3e0584cc6db99650a75eb2948f2b9' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: '9a5f1e45e8b83f1b259ba72d11c5908701b8678b86f01d81196771818e614d01' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: 'dd3bb4762dd90da99ea1c0571a2b40dd00761fa70a4ab85d47fc07487564e0f46dfa4d102c3f8ca3' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: 'be52f406be464569e7d27da6bf405bc1' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: 'a566d3ca17f14b2376c7b92c019f22c831325eb9' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac3_384_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });


    describe('PBKDF2-HMAC-SHA3-512 (cross-check vs Python hashlib)', () => {
        const VECTORS = [
        { case: 'basic_c1_32B', pw: 'password', salt: 'salt', c: 1, dklen: 32, dk: 'f7a2684630ec0f81f23abbf606278deeaad1a35053db3c066903d9114ed3fd6e' },
        { case: 'mod_c4096_32B', pw: 'password', salt: 'salt', c: 4096, dklen: 32, dk: '2bfaf2d5ceb6d10f5e262cd902488cfd4489614ecd6709e5ee395dc33f2e9ad7' },
        { case: 'long_c4096_40B', pw: 'passwordPASSWORDpassword', salt: 'saltSALTsaltSALTsaltSALTsaltSALTsalt', c: 4096, dklen: 40, dk: 'd60791a4ed27195d813f35510351b9d1ff9ad426215394460950a4fe03dd9f548710e552615ab127' },
        { case: 'empty_pw_c10', pw: '', salt: 'salt', c: 10, dklen: 16, dk: '8bd6850a77d89a94ec3f70a4d7e7760b' },
        { case: 'short_c2_dk20', pw: 'p', salt: 's', c: 2, dklen: 20, dk: 'dd9841dbb7c20533122869ffa09e15505539e21e' },
        ];
        test.each(VECTORS)('case=$case (c=$c, dkLen=$dklen B)', (v) => {
            const dk = _pbkdf2(v.pw, v.salt, v.c, v.dklen * 8, _hmac3_512_pbk);
            expect(toHex(dk)).toBe(v.dk);
        }, 60_000);
    });

    // ── Edge case (audit post-upgrade Finding 4) ─────────────────────────
    test('length=0 returns [] (no phantom block)', () => {
        const dk = _pbkdf2('password', 'salt', 1000, 0);
        expect(dk).toEqual([]);
    });
});
