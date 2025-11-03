// File: /api/analyze-outfit.js

// 1. Import the Google AI SDK
import { GoogleGenerativeAI } from "@google/generative-ai";

// 2. Get your secret API key from environment variables
//    NEVER paste your API key directly in the code.
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

// 3. This is the main serverless function
export default async function handler(request, response) {
  // Only allow POST requests
  if (request.method !== 'POST') {
    return response.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 4. Get the image and prompt from the frontend
    const { image: imageBase64, prompt } = request.body;

    if (!imageBase64 || !prompt) {
      return response.status(400).json({ error: 'Missing image or prompt' });
    }

    // 5. Tell the AI how to act (This is the system prompt)
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });
    const systemPrompt = `
      You are a helpful and stylish fashion advisor. 
      The user will provide an image and a question. 
      Analyze the outfit in the image and provide a helpful, detailed response.
      Structure your response using markdown for clear formatting. Include:
      1.  A general opinion on its 'look' for the user's context.
      2.  A suggested color palette that would match.
      3.  Suggestions for ornaments and accessories.
      4.  Friendly and actionable improvement suggestions.
    `;

    // 6. Create the parts for the AI:
    //    - The system prompt
    //    - The user's text question
    //    - The image file
    const requestParts = [
      systemPrompt,
      prompt,
      fileToGenerativePart(imageBase64, "image/jpeg"), // We assume jpeg, but you could also detect this
    ];

    // 7. Call the AI!
    const result = await model.generateContent({ contents: [{ parts: requestParts }] });
    const aiResponse = result.response.candidates[0].content.parts[0].text;

    // 8. Send the AI's text response back to the frontend
    return response.status(200).json({ analysis: aiResponse });

  } catch (error) {
    console.error("AI Error:", error);
    return response.status(500).json({ error: 'Failed to get analysis from AI.' });
  }
}