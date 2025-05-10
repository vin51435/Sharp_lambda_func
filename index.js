const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: 'ap-south-1' });

/**
 * AWS Lambda handler for image compression and uploading to S3.
 *
 * @param {Object} event - The event object containing the request data.
 * @param {string} event.body - The JSON stringified body containing `username` and `files`.
 * @returns {Object} - The response object with `statusCode` and `body`.
 *
 * The function processes an array of files, compresses them using the `sharp` library,
 * and uploads them to an S3 bucket named 'studenhub-media'. Each file is expected to have
 * a `fileBase64` string, `fileName`, and `mimeType`. The function supports optional
 * configuration for format and quality of compression, and resizing dimensions.
 *
 * If no files are provided, it returns a 400 status code with an error message.
 * If the process is successful, it returns a 200 status code with details of the uploaded files.
 * In case of errors during processing, it logs the error and returns a 500 status code.
 */
exports.handler = async (event) => {
    try {
        const {
            username,
            files, // Array of files
        } = JSON.parse(event.body);

        const bucketName = 'studenhub-media';
        const uploadedFiles = [];

        if (!files || !Array.isArray(files) || files.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    message: 'No files provided',
                }),
            };
        }

        for (const file of files) {
            const {
                fileBase64,
                fileName = '',
                mimeType,
                config = {
                    format: 'jpeg', // or 'png'
                    quality: 60,
                    resize: { width: 1280, height: 1280 }, // optional resize
                },
            } = file;

            const base64 = file.fileBase64.includes(';base64,')
                ? file.fileBase64.split(';base64,').pop()
                : file.fileBase64;

            let buffer = Buffer.from(base64, 'base64');

            const inputMeta = await sharp(buffer).metadata();

            // Convert HEIC (iPhone) to JPEG
            if (inputMeta.format === 'heic' || inputMeta.format === 'heif') {
                console.log('Converting HEIC to JPEG');
                buffer = await sharp(buffer).jpeg({ quality: config.quality }).toBuffer();
            }

            let pipeline = sharp(buffer);

            // Uncomment to enable resizing
            // if (config.resize) {
            //   pipeline = pipeline.resize(config.resize);
            // }

            if (config.format === 'jpeg' || config.format === 'jpg') {
                pipeline = pipeline.jpeg({ quality: config.quality, mozjpeg: true });
            } else if (config.format === 'png') {
                pipeline = pipeline.png({ compressionLevel: 9 });
            }

            const compressed = await pipeline.toBuffer();

            const key = `uploads/${username ?? ''}-${Date.now()}-${fileName}`;

            const putCommand = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: compressed,
                ContentType: mimeType,
            });

            await s3.send(putCommand);

            uploadedFiles.push({
                fileName,
                key,
                url: `https://${bucketName}.s3.ap-south-1.amazonaws.com/${key}`,
            });
        }

        return {
            statusCode: 200,
            body: JSON.stringify({
                uploaded: uploadedFiles,
            }),
        };

    } catch (error) {
        console.error('Error processing image:', error);
        return {
            statusCode: 500,
            body: JSON.stringify({
                message: 'Internal Server Error',
                error: error.message,
            }),
        };
    }
};
