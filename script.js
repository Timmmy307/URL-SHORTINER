document.getElementById('linkForm').addEventListener('submit', (event) => {
    event.preventDefault();

    const urlInput = document.getElementById('url').value.trim();

    if (!urlInput) {
        alert('Please enter a valid URL.');
        return;
    }

    // Custom obfuscation method
    const obfuscatedUrl = obfuscateUrl(urlInput);

    // Generate the short link with `/l/?=` structure
    const shortLink = `${window.location.origin}/l/?=${obfuscatedUrl}`;
    document.getElementById('output').textContent = `Short link created: ${shortLink}`;
});

// Obfuscation function: scramble the URL into an unrecognizable string
function obfuscateUrl(url) {
    let scrambled = encodeURIComponent(url) // Ensure the URL is safe for encoding
        .split('')
        .map((char) => char.charCodeAt(0).toString(36)) // Convert to base-36 (shorter than hex)
        .join('');
    return scrambled;
}

// Decoding function: reverse the obfuscation process
function decodeObfuscatedUrl(obfuscated) {
    try {
        let decoded = obfuscated.match(/.{1,2}/g) // Split by pairs (base-36 encoding)
            .map((pair) => String.fromCharCode(parseInt(pair, 36)))
            .join('');
        return decodeURIComponent(decoded); // Decode back into a normal URL
    } catch {
        return null;
    }
}

// Redirect Logic
const urlParams = new URLSearchParams(window.location.search);
const obfuscatedUrl = urlParams.get('=');

if (obfuscatedUrl) {
    const decodedUrl = decodeObfuscatedUrl(obfuscatedUrl);
    if (decodedUrl) {
        window.location.href = decodedUrl;
    } else {
        document.body.innerHTML = '<h1>Invalid or corrupted link.</h1>';
    }
} else {
    document.body.innerHTML = '<h1>Missing redirect parameter.</h1>';
}
