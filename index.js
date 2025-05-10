const sharp = require('sharp');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

const s3 = new S3Client({ region: 'ap-south-1' });

exports.handler = async (event) => {
    const start = Date.now(); // Measure total time

    try {
        const { username, files } = JSON.parse(event.body);
        const bucketName = 'studenhub-media';
        const uploadedFiles = [];

        if (!files || !Array.isArray(files) || files.length === 0) {
            return {
                statusCode: 400,
                body: JSON.stringify({ message: 'No files provided' }),
            };
        }

        for (const file of files) {
            const {
                fileBase64,
                fileName = '',
                mimeType,
                config = {
                    format: 'jpeg',
                    quality: 60,
                    resize: { width: 1280, height: 1280 },
                },
            } = file;

            const base64 = fileBase64.includes(';base64,')
                ? fileBase64.split(';base64,').pop()
                : fileBase64;

            let buffer = Buffer.from(base64, 'base64');

            const metaStart = Date.now();
            const inputMeta = await sharp(buffer).metadata();
            console.log(`Metadata fetched in ${Date.now() - metaStart}ms`);

            if (inputMeta.format === 'heic' || inputMeta.format === 'heif') {
                console.log('Converting HEIC to JPEG');
                buffer = await sharp(buffer).jpeg({ quality: config.quality }).toBuffer();
            }

            let pipeline = sharp(buffer);

            if (config.resize && (inputMeta.width > config.resize.width || inputMeta.height > config.resize.height)) {
                console.log(`Resizing to ${config.resize.width}x${config.resize.height}`);
                pipeline = pipeline.resize(config.resize);
            }

            if (config.format === 'jpeg' || config.format === 'jpg') {
                pipeline = pipeline.jpeg({ quality: config.quality, mozjpeg: true });
            } else if (config.format === 'png') {
                pipeline = pipeline.png({ compressionLevel: 9 });
            }

            const compressStart = Date.now();
            const compressed = await pipeline.toBuffer();
            console.log(`Image processed in ${Date.now() - compressStart}ms`);

            const key = `uploads/${username ?? ''}-${Date.now()}-${fileName}`;

            const uploadStart = Date.now();
            const putCommand = new PutObjectCommand({
                Bucket: bucketName,
                Key: key,
                Body: compressed,
                ContentType: mimeType,
            });

            await s3.send(putCommand);
            console.log(`Uploaded to S3 in ${Date.now() - uploadStart}ms`);

            uploadedFiles.push({
                fileName,
                key,
                url: `https://${bucketName}.s3.ap-south-1.amazonaws.com/${key}`,
            });
        }

        console.log(`Total processing time: ${Date.now() - start}ms`);

        return {
            statusCode: 200,
            body: JSON.stringify({ uploaded: uploadedFiles }),
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