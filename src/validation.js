// Validates surf report form input before it reaches the database. Returning the
// parsed values here keeps route handlers from repeating Number(...) everywhere.
export function validateReport({ description = "", waveHeight = "", rating = "", file }) {
  const errors = [];
  const parsedWaveHeight = Number(waveHeight);
  // Rating is optional, so blank means "no rating" instead of an error.
  const hasRating = String(rating).trim() !== "";
  const parsedRating = hasRating ? Number(rating) : null;

  if (description.trim().length < 5 || description.trim().length > 280) {
    errors.push("Description must be between 5 and 280 characters.");
  }
  if (!Number.isInteger(parsedWaveHeight) || parsedWaveHeight < 1 || parsedWaveHeight > 100) {
    errors.push("Wave height must be a number from 1 to 100 feet.");
  }
  if (hasRating && (!Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 10)) {
    errors.push("Rating must be a number from 1 to 10.");
  }

  return { errors, values: { description: description.trim(), waveHeight: parsedWaveHeight, rating: parsedRating } };
}
