// File: /api/analyze-outfit.js

// 1. Import the Google AI SDK
import { GoogleGenerativeAI } from "@google/generative-ai";

// 2. Get your secret API key from environment variables
//    NEVER paste your API key directly in the code.
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

/**
 * Helper function to convert the base64 image from the frontend
 * into the format the AI API needs.
 */
function fileToGenerativePart(base64Data, mimeType) {
  return {
    inlineData: {
      data: base64Data,
      mimeType
    },
  };
}

// Constants for validation
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB
const MAX_PROMPT_LENGTH = 1000;
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Helper function to validate base64 image
function validateImage(base64String) {
  try {
    // Check if it's a valid base64 string with MIME type
    if (!base64String.startsWith('data:')) {
      return { isValid: false, error: 'Invalid image format: Missing data URL prefix' };
    }

    const [header, content] = base64String.split(',');
    if (!header || !content) {
      return { isValid: false, error: 'Invalid image format: Malformed data URL' };
    }

    // Extract MIME type from the header
    const mimeMatch = header.match(/^data:(image\/[^;]+);base64$/);
    if (!mimeMatch) {
      return { isValid: false, error: 'Invalid image format: Invalid MIME type format' };
    }

    const mime = mimeMatch[1];
    if (!ALLOWED_MIME_TYPES.includes(mime)) {
      return { 
        isValid: false, 
        error: `Invalid image type. Only ${ALLOWED_MIME_TYPES.join(', ')} are allowed.` 
      };
    }

    // Check size
    const sizeInBytes = Buffer.from(content, 'base64').length;
    if (sizeInBytes > MAX_IMAGE_SIZE) {
      const sizeMB = (MAX_IMAGE_SIZE / (1024 * 1024)).toFixed(1);
      return { 
        isValid: false, 
        error: `Image too large. Maximum size is ${sizeMB}MB.` 
      };
    }

    // --- FIX 1: ---
    // Return the raw content and the mime type, not just the mime type.
    return { isValid: true, mime, content };

  } catch (error) {
    console.error('Image validation error:', error);
    return { 
      isValid: false, 
      error: 'Invalid image data: Could not process the image' 
    };
  }
}

// 3. This is the main serverless function
export default async function handler(request, response) {
  // Set CORS headers
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Handle OPTIONS request for CORS
  if (request.method === 'OPTIONS') {
    return response.status(200).end();
  }

  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // Check request size
    const contentLength = parseInt(request.headers['content-length'] || '0');
    if (contentLength > MAX_IMAGE_SIZE + 1000) { // Adding 1000 bytes for prompt and other data
      return response.status(413).json({ error: 'Request too large' });
    }

    // 4. Get the image and prompt from the frontend
    const { image: imageBase64, prompt } = request.body;

    if (!imageBase64 || !prompt) {
      return response.status(400).json({ error: 'Missing image or prompt' });
    }

    // Validate prompt length
    if (prompt.length > MAX_PROMPT_LENGTH) {
      return response.status(400).json({ error: `Prompt too long. Maximum length is ${MAX_PROMPT_LENGTH} characters.` });
    }

    // Validate image
    const imageValidation = validateImage(imageBase64);
    if (!imageValidation.isValid) {
      return response.status(400).json({ error: imageValidation.error });
    }

    // 5. Tell the AI how to act (This is the system prompt)
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
  	const systemPrompt = `
You are **StyleScan**, an expert AI fashion stylist, personal wardrobe consultant, and aesthetic advisor. 
Your tone is friendly, confident, and fashion-forward — like a stylist who wants the user to look their absolute best without judgment.

The user will upload an image of their outfit and optionally provide a *context or occasion* (examples: first date, college event, office day, party, dinner, festival, photoshoot, etc.). 
Your job is to **analyze the outfit within that specific context** and give **clear, helpful, confidence-boosting feedback**.

Speak to the user as if you're right there with them, helping them decide what works and what could be improved — always respectfully and positively.

---

### ***Follow this exact response format and structure. Use Markdown formatting.***

### 🌟 Overall Vibe
Describe the outfit in 2–3 sentences.
Comment on:
- The general impression the outfit gives (stylish, casual, bold, minimal, cozy, trendy, classic, etc.)
- Whether it fits the user's stated *context*
- How it reflects personality or mood

Example:
> “This outfit gives a confident, relaxed vibe. It works very well for a casual date — it feels natural and effortless while still showing thought.”

---

### 🎨 Color & Palette
Analyze the color scheme:
- Do the colors complement each other?
- Are they bold, neutral, monochrome, earth-toned, etc.?
- Suggest **1–2 alternative color accents** that could enhance balance or visual interest.

Example:
> “The neutral palette works very well. Adding a warm accent like olive or rust could make the look feel even richer.”

---

### 🧥 Garment Analysis
Evaluate the key clothing pieces one by one, focusing on fit, cut, texture, and appropriateness.

* **Top:** (Fit, shape, neckline, layering potential, trend relevance)
* **Bottoms:** (Silhouette, proportion, drape, how it pairs with the top)
* **Footwear:** (Cleanliness, style match, does it suit the vibe?)

You may also include:
* **Outerwear:** (If present)
* **Bag / Additional garments:** (If visible)

---

### ✨ Accessory & Styling Suggestions
Give **3–5 specific, realistic, affordable, and achievable tips**. 
Avoid vague advice — make every suggestion *possible for the user to act on today*.

Include:
* **Accessories:** (watch, rings, earrings, necklace, belt, sunglasses, bag, etc.)
* **Styling / Grooming:** (hair suggestions, beard trim, makeup tone, layering trick, cuffing sleeves, tucking shirt, etc.)
* **Swap or Upgrade Idea:** Recommend *one clear improvement*.
  Example: “Swap the athletic shoes for clean white sneakers to elevate the outfit without losing comfort.”

Tips must be supportive, never negative.

---

### ✅ The Verdict
Close with a warm, encouraging final message.
Make the user feel confident and excited to wear the outfit.

Example:
> “You’re definitely on the right track — this look has personality and comfort. With just a couple of small tweaks, it’ll look even more intentional and stylish!”

---

Always encourage the user and celebrate their effort. The goal is to help them improve their style while feeling great about themselves.
`;


    // 6. Create the parts for the AI:
    //    - The system prompt
    //    - The user's text question
    //    - The image file
    const requestParts = [
      systemPrompt,
      prompt,
      // --- FIX 2: ---
      // Use the validated content (raw base64) and mime type,
      // not the full base64 string and a hardcoded "image/jpeg".
      fileToGenerativePart(imageValidation.content, imageValidation.mime),
    ];

    // 7. Call the AI!
    const result = await model.generateContent({ contents: [{ parts: requestParts }] });
    const aiResponse = result.response.candidates[0].content.parts[0].text;

    // 8. Send the AI's text response back to the frontend
    return response.status(200).json({ analysis: aiResponse });

  } catch (error) {
    console.error("AI Error:", error);
    
    // Provide more specific error messages based on the error type
    let errorMessage = 'Failed to get analysis from AI.';
    let statusCode = 500;

    if (error.message?.includes('API key')) {
      errorMessage = 'API configuration error';
    } else if (error.message?.includes('rate limit')) {
      errorMessage = 'Service is temporarily busy. Please try again later.';
      statusCode = 429;
    } else if (error.message?.includes('timeout')) {
      errorMessage = 'Request timed out. Please try again.';
      statusCode = 504;
    }

    return response.status(statusCode).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}