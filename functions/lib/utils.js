/**
 * utils.js - Shared utility functions for Abra MVP
 * Provides URI encoding, UUID generation, and worker roster constants
 */

// Worker roster constant - all available workers
const WORKER_ROSTER = [
  'Amylea',
  'Angelo',
  'Chloe',
  'George',
  'Leeroy',
  'Myka',
  'Nathan',
  'Olivia',
  'Tracy'
];

/**
 * Encode a string for safe use in URIs (e.g., Google Maps URLs)
 * @param {string} str - The string to encode
 * @returns {string} URI-encoded string
 */
function encodeURI(str) {
  return encodeURIComponent(str);
}

/**
 * Generate a UUID v4
 * @returns {string} A UUID string in format xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
 */
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Build a Google Maps URL from address components
 * @param {string} street - Street name
 * @param {string} houseNumber - House number
 * @returns {string} Google Maps URL
 */
function buildMapsURL(street, houseNumber) {
  const address = `${houseNumber} ${street}`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURI(address)}`;
}

module.exports = {
  WORKER_ROSTER,
  encodeURI,
  generateUUID,
  buildMapsURL
};
