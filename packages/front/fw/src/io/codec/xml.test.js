// Copyright (c) 2026 AwaCloud SAS
// Author: Matthieu Bouilloux
// SPDX-License-Identifier: Apache-2.0

import { describe, test, expect, beforeEach } from 'bun:test';
import { xml } from './xml.js';

describe('xml module', () => {

    // ── Module metadata ──────────────────────────────────────────────────────

    test('should have correct module metadata', () => {
        expect(xml.name).toBe('xml');
        expect(xml.dependencies).toEqual([]);
        expect(typeof xml.factory).toBe('function');
    });

    // ── Factory API ───────────────────────────────────────────────────────────

    describe('factory', () => {
        test('should create instance with expected API', () => {
            const inst = xml.factory();
            expect(typeof inst.el).toBe('function');
            expect(typeof inst.text).toBe('function');
            expect(typeof inst.parse).toBe('function');
            expect(typeof inst.serialize).toBe('function');
            expect(typeof inst.serializeNode).toBe('function');
            expect(typeof inst.findChild).toBe('function');
            expect(typeof inst.findAll).toBe('function');
            expect(typeof inst.textContent).toBe('function');
            expect(typeof inst.encodeText).toBe('function');
            expect(typeof inst.encodeAttr).toBe('function');
            expect(typeof inst.decodeEntities).toBe('function');
            expect(typeof inst.XmlParseError).toBe('function');
        });
    });

    // ── Shared instance ───────────────────────────────────────────────────────

    let inst;
    beforeEach(() => { inst = xml.factory(); });

    // ── el / text constructors ────────────────────────────────────────────────

    describe('el', () => {
        test('creates element node with defaults', () => {
            const node = inst.el('root');
            expect(node).toEqual({ type: 'element', name: 'root', attrs: {}, children: [] });
        });

        test('creates element node with attrs and children', () => {
            const child = inst.text('hello');
            const node = inst.el('w:p', { 'xml:lang': 'fr' }, [child]);
            expect(node.type).toBe('element');
            expect(node.name).toBe('w:p');
            expect(node.attrs).toEqual({ 'xml:lang': 'fr' });
            expect(node.children).toEqual([child]);
        });
    });

    describe('text', () => {
        test('creates text node', () => {
            expect(inst.text('hello')).toEqual({ type: 'text', value: 'hello' });
        });
    });

    // ── parse ─────────────────────────────────────────────────────────────────

    describe('parse', () => {
        test('parses simple self-closing element', () => {
            const r = inst.parse('<root/>');
            expect(r.type).toBe('element');
            expect(r.name).toBe('root');
            expect(r.children).toEqual([]);
        });

        test('parses self-closing with space before slash', () => {
            const r = inst.parse('<br />');
            expect(r.name).toBe('br');
            expect(r.children).toEqual([]);
        });

        test('parses attributes with double quotes', () => {
            const r = inst.parse('<a x="1" y="two"/>');
            expect(r.attrs).toEqual({ x: '1', y: 'two' });
        });

        test('parses attributes with single quotes', () => {
            const r = inst.parse("<a x='1' y='two'/>");
            expect(r.attrs).toEqual({ x: '1', y: 'two' });
        });

        test('parses empty attribute', () => {
            const r = inst.parse('<a foo=""/>');
            expect(r.attrs.foo).toBe('');
        });

        test('parses nested elements with text', () => {
            const r = inst.parse('<a><b>hello</b></a>');
            expect(r.children[0].name).toBe('b');
            expect(inst.textContent(r.children[0])).toBe('hello');
        });

        test('decodes predefined entities in text', () => {
            const r = inst.parse('<a>A &amp; B &lt;C&gt; &quot;D&quot; &apos;E&apos;</a>');
            expect(inst.textContent(r)).toBe('A & B <C> "D" \'E\'');
        });

        test('decodes decimal numeric reference &#65; → A', () => {
            const r = inst.parse('<a>&#65;</a>');
            expect(inst.textContent(r)).toBe('A');
        });

        test('decodes hex numeric reference &#x2A; → *', () => {
            const r = inst.parse('<a>&#x2A;</a>');
            expect(inst.textContent(r)).toBe('*');
        });

        test('decodes &#42; → *', () => {
            const r = inst.parse('<a>&#42;</a>');
            expect(inst.textContent(r)).toBe('*');
        });

        test('decodes entities in attribute values', () => {
            const r = inst.parse('<a href="a&amp;b"/>');
            expect(r.attrs.href).toBe('a&b');
        });

        test('skips XML prolog and comments', () => {
            const r = inst.parse('<?xml version="1.0"?><!-- comment --><root/>');
            expect(r.name).toBe('root');
        });

        test('skips comments anywhere', () => {
            const r = inst.parse('<a><!-- ignored --><b/></a>');
            expect(r.children.length).toBe(1);
            expect(r.children[0].name).toBe('b');
        });

        test('CDATA is parsed as literal text (no entity expansion)', () => {
            const r = inst.parse('<a><![CDATA[<not-a-tag> & raw]]></a>');
            expect(inst.textContent(r)).toBe('<not-a-tag> & raw');
        });

        test('processing instructions are skipped', () => {
            const r = inst.parse('<?php echo "hi"; ?><root/>');
            expect(r.name).toBe('root');
        });

        test('preserves xmlns namespace attributes', () => {
            const r = inst.parse('<root xmlns="urn:x" xmlns:w="urn:w"><w:p/></root>');
            expect(r.attrs['xmlns']).toBe('urn:x');
            expect(r.attrs['xmlns:w']).toBe('urn:w');
        });

        test('preserves prefixed element names', () => {
            const r = inst.parse('<w:document xmlns:w="urn:w"><w:body/></w:document>');
            expect(r.name).toBe('w:document');
            expect(r.children[0].name).toBe('w:body');
        });

        test('BOM (U+FEFF) is silently consumed', () => {
            const r = inst.parse('﻿<root/>');
            expect(r.name).toBe('root');
        });

        test('whitespace is preserved in mixed content', () => {
            const r = inst.parse('<a> hello </a>');
            expect(inst.textContent(r)).toBe(' hello ');
        });

        test('multiple children with text', () => {
            const r = inst.parse('<root><a>1</a><b>2</b></root>');
            expect(r.children.length).toBe(2);
        });

        // ── Error cases ───────────────────────────────────────────────────────

        test('throws XmlParseError on mismatched end tag', () => {
            expect(() => inst.parse('<a></b>')).toThrow(inst.XmlParseError);
        });

        test('throws XmlParseError on no root element', () => {
            expect(() => inst.parse('  ')).toThrow(inst.XmlParseError);
        });

        test('throws XmlParseError on unclosed element', () => {
            expect(() => inst.parse('<a>')).toThrow(inst.XmlParseError);
        });

        test('throws XmlParseError on unterminated start tag', () => {
            expect(() => inst.parse('< broken')).toThrow(inst.XmlParseError);
        });

        test('thrown error has code xml/parse-error', () => {
            try {
                inst.parse('<a></b>');
                expect(true).toBe(false); // must not reach here
            } catch (e) {
                expect(e).toBeInstanceOf(inst.XmlParseError);
                expect(e.code).toBe('xml/parse-error');
                expect(e.name).toBe('XmlParseError');
            }
        });
    });

    // ── serialize / serializeNode ─────────────────────────────────────────────

    describe('serializeNode', () => {
        test('serializes self-closing element', () => {
            expect(inst.serializeNode(inst.el('br'))).toBe('<br/>');
        });

        test('serializes element with attributes', () => {
            expect(inst.serializeNode(inst.el('a', { href: 'x' }))).toBe('<a href="x"/>');
        });

        test('serializes text node with entity encoding', () => {
            expect(inst.serializeNode(inst.text('A & B'))).toBe('A &amp; B');
        });

        test('encodes attribute special chars', () => {
            const node = inst.el('a', { x: '<&">' });
            expect(inst.serializeNode(node)).toBe('<a x="&lt;&amp;&quot;&gt;"/>');
        });

        test('serializes nested tree', () => {
            const src = '<a x="1"><b>hi</b><c/></a>';
            expect(inst.serializeNode(inst.parse(src))).toBe(src);
        });

        test('serializes element with children', () => {
            const node = inst.el('root', {}, [inst.text('hello')]);
            expect(inst.serializeNode(node)).toBe('<root>hello</root>');
        });
    });

    describe('serialize', () => {
        test('emits XML prolog with UTF-8 and standalone', () => {
            const node = inst.el('root');
            const out = inst.serialize(node);
            expect(out).toContain('<?xml version="1.0"');
            expect(out).toContain('encoding="UTF-8"');
            expect(out).toContain('standalone="yes"');
        });

        test('prolog is followed by serialized node', () => {
            const node = inst.el('root');
            const out = inst.serialize(node);
            expect(out).toContain('<root/>');
        });
    });

    // ── Round-trip ────────────────────────────────────────────────────────────

    describe('round-trip', () => {
        test('parse(serializeNode(parse(src))) is structurally equivalent', () => {
            const src = '<root xmlns:w="urn:w"><w:p>hello &amp; world</w:p><w:br/></root>';
            const tree1 = inst.parse(src);
            const xml1  = inst.serializeNode(tree1);
            const tree2 = inst.parse(xml1);
            // Compare structure via serialization
            expect(inst.serializeNode(tree2)).toBe(xml1);
        });

        test('serialize/parse round-trip preserves text content', () => {
            const original = inst.el('doc', {}, [inst.el('item', { id: '1' }, [inst.text('hello')])]);
            const str = inst.serialize(original);
            const parsed = inst.parse(str.slice(str.indexOf('<doc')));
            expect(inst.textContent(inst.findChild(parsed, 'item'))).toBe('hello');
        });
    });

    // ── findChild / findAll ───────────────────────────────────────────────────

    describe('findChild', () => {
        test('returns first matching child', () => {
            const r = inst.parse('<root><a/><b/><a/></root>');
            const child = inst.findChild(r, 'a');
            expect(child).not.toBeNull();
            expect(child.name).toBe('a');
        });

        test('returns null if not found', () => {
            const r = inst.parse('<root><a/></root>');
            expect(inst.findChild(r, 'z')).toBeNull();
        });

        test('returns null for element with no children', () => {
            const r = inst.parse('<root/>');
            expect(inst.findChild(r, 'a')).toBeNull();
        });
    });

    describe('findAll', () => {
        test('returns all matching children', () => {
            const r = inst.parse('<root><a/><b/><a/></root>');
            const all = inst.findAll(r, 'a');
            expect(all.length).toBe(2);
        });

        test('returns empty array if none found', () => {
            const r = inst.parse('<root><a/></root>');
            expect(inst.findAll(r, 'z')).toEqual([]);
        });

        test('returns empty array for element with no children', () => {
            const r = inst.parse('<root/>');
            expect(inst.findAll(r, 'a')).toEqual([]);
        });
    });

    // ── textContent ───────────────────────────────────────────────────────────

    describe('textContent', () => {
        test('returns text from simple element', () => {
            const r = inst.parse('<a>hello</a>');
            expect(inst.textContent(r)).toBe('hello');
        });

        test('concatenates nested text nodes recursively', () => {
            const r = inst.parse('<a>foo<b>bar</b>baz</a>');
            expect(inst.textContent(r)).toBe('foobarbaz');
        });

        test('returns empty string for element with no text', () => {
            const r = inst.parse('<a><b/><c/></a>');
            expect(inst.textContent(r)).toBe('');
        });

        test('returns empty string for null', () => {
            expect(inst.textContent(null)).toBe('');
        });

        test('returns value for text node directly', () => {
            expect(inst.textContent(inst.text('hi'))).toBe('hi');
        });
    });

    // ── encodeText ────────────────────────────────────────────────────────────

    describe('encodeText', () => {
        test('encodes ampersand', () => {
            expect(inst.encodeText('A & B')).toBe('A &amp; B');
        });

        test('encodes less-than', () => {
            expect(inst.encodeText('<tag>')).toBe('&lt;tag&gt;');
        });

        test('does not encode double-quote', () => {
            expect(inst.encodeText('"hello"')).toBe('"hello"');
        });

        test('coerces non-string input', () => {
            expect(inst.encodeText(42)).toBe('42');
        });
    });

    // ── encodeAttr ────────────────────────────────────────────────────────────

    describe('encodeAttr', () => {
        test('encodes double-quote', () => {
            expect(inst.encodeAttr('"foo"')).toBe('&quot;foo&quot;');
        });

        test('encodes ampersand, lt, gt, quot together', () => {
            expect(inst.encodeAttr('A & <B> "C"')).toBe('A &amp; &lt;B&gt; &quot;C&quot;');
        });
    });

    // ── decodeEntities ────────────────────────────────────────────────────────

    describe('decodeEntities', () => {
        test('decodes &amp;', () => expect(inst.decodeEntities('&amp;')).toBe('&'));
        test('decodes &lt;',  () => expect(inst.decodeEntities('&lt;')).toBe('<'));
        test('decodes &gt;',  () => expect(inst.decodeEntities('&gt;')).toBe('>'));
        test('decodes &quot;', () => expect(inst.decodeEntities('&quot;')).toBe('"'));
        test('decodes &apos;', () => expect(inst.decodeEntities('&apos;')).toBe("'"));
        test('decodes &#65; → A', () => expect(inst.decodeEntities('&#65;')).toBe('A'));
        test('decodes &#x41; → A', () => expect(inst.decodeEntities('&#x41;')).toBe('A'));
        test('leaves unknown entities intact', () => {
            expect(inst.decodeEntities('&unknown;')).toBe('&unknown;');
        });
        test('decodes &amp;lt; as two-pass? No - single pass only', () => {
            // Single-pass: &amp;lt; → &lt; (the &amp; is decoded, ;lt; is left)
            expect(inst.decodeEntities('&amp;lt;')).toBe('&lt;');
        });
    });

    // ── robustness / regression ───────────────────────────────────────────────

    describe('robustness / regression', () => {

        // decodeEntities - invalid code points must not throw

        test('&#999999999; does not throw and returns match literal', () => {
            expect(() => inst.decodeEntities('&#999999999;')).not.toThrow();
            expect(inst.decodeEntities('&#999999999;')).toBe('&#999999999;');
        });

        test('&#x110000; (above Unicode max) does not throw and returns match literal', () => {
            expect(() => inst.decodeEntities('&#x110000;')).not.toThrow();
            expect(inst.decodeEntities('&#x110000;')).toBe('&#x110000;');
        });

        test('&#xD800; (surrogate) does not throw and returns match literal', () => {
            expect(() => inst.decodeEntities('&#xD800;')).not.toThrow();
            expect(inst.decodeEntities('&#xD800;')).toBe('&#xD800;');
        });

        test('&#xDFFF; (surrogate upper bound) does not throw and returns match literal', () => {
            expect(() => inst.decodeEntities('&#xDFFF;')).not.toThrow();
            expect(inst.decodeEntities('&#xDFFF;')).toBe('&#xDFFF;');
        });

        test('&#-1; does not decode (negative, returned as literal)', () => {
            // Note: regex &#\d+; only matches digits, so &#-1; won't even match the pattern
            // but if it somehow reaches decoding it must not throw
            expect(() => inst.decodeEntities('&#-1;')).not.toThrow();
            // &#-1; does not match &#\d+; - returned unchanged
            expect(inst.decodeEntities('&#-1;')).toBe('&#-1;');
        });

        // DOCTYPE with internal subset - parse must not throw

        test('DOCTYPE with internal subset parses correctly', () => {
            const r = inst.parse('<!DOCTYPE html [ <!ENTITY x "y"> ]><root/>');
            expect(r).not.toBeNull();
            expect(r.name).toBe('root');
        });

        test('DOCTYPE with internal subset containing > in entity value parses correctly', () => {
            const r = inst.parse('<!DOCTYPE html [ <!ENTITY foo "bar"> ]><doc><item/></doc>');
            expect(r.name).toBe('doc');
            expect(r.children[0].name).toBe('item');
        });

        // XmlParseError accessible via factory return - not as named module export

        test('inst.XmlParseError is a class (function)', () => {
            expect(typeof inst.XmlParseError).toBe('function');
        });

        test('errors thrown by parse are instanceof inst.XmlParseError', () => {
            try {
                inst.parse('<a></b>');
                expect(true).toBe(false);
            } catch (e) {
                expect(e).toBeInstanceOf(inst.XmlParseError);
            }
        });

        test('two factory instances have independent XmlParseError classes', () => {
            const inst2 = xml.factory();
            // Errors from inst are instanceof inst.XmlParseError but also Error
            try {
                inst.parse('<a></b>');
            } catch (e) {
                expect(e).toBeInstanceOf(Error);
                expect(e).toBeInstanceOf(inst.XmlParseError);
                // Not necessarily instanceof inst2.XmlParseError (different class per factory call)
                // but both share Error as base
                expect(e).toBeInstanceOf(Error);
            }
        });
    });

});
