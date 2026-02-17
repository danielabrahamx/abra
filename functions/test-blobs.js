/**
 * test-blobs.js - Diagnostic test for Netlify Blobs
 * Simple test to verify Blobs is working
 */

exports.handler = async (event) => {
    try {
        // Test 1: Can we import the module?
        let blobsModule;
        try {
            blobsModule = require('@netlify/blobs');
        } catch (importError) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Failed to import @netlify/blobs',
                    message: importError.message,
                    stack: importError.stack
                })
            };
        }

        // Test 2: Can we get the store?
        let store;
        try {
            const { getStore } = blobsModule;
            store = getStore('abra-data');
        } catch (storeError) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Failed to get store',
                    message: storeError.message,
                    stack: storeError.stack
                })
            };
        }

        // Test 3: Can we write/read a simple value?
        try {
            await store.setJSON('test', { hello: 'world' });
            const data = await store.get('test', { type: 'json' });

            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    success: true,
                    message: 'Blobs is working correctly',
                    testData: data
                })
            };
        } catch (operationError) {
            return {
                statusCode: 500,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    error: 'Failed to read/write blob',
                    message: operationError.message,
                    stack: operationError.stack
                })
            };
        }

    } catch (error) {
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                error: 'Unexpected error',
                message: error.message,
                stack: error.stack
            })
        };
    }
};
