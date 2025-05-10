When creating a zip file for AWS Lambda, make sure to include the `node_modules` directory (but **not** the `sharp` package, as it will be provided by the AWS Lambda function layer) and the `package.json` file, and exclude `package-lock.json`, `.gitignore` and `README.md` by using the following command:

