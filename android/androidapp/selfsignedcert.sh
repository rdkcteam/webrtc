#!/bin/sh
MY_SERVER=192.168.0.15
echo | openssl s_client -connect ${MY_SERVER}:8443 2>&1 | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > mycert.pem

export CLASSPATH=/home/kumar/workspace/android/bcprov-jdk15on-158.jar
CERTSTORE=res/raw/mystore.bks
if [ -a $CERTSTORE ]; then
    rm $CERTSTORE || exit 1
fi
keytool \
      -import \
      -v \
      -trustcacerts \
      -alias 0 \
      -file mycert.pem \
      -keystore $CERTSTORE \
      -storetype BKS \
      -provider org.bouncycastle.jce.provider.BouncyCastleProvider \
      -providerpath /home/kumar/workspace/android/bcprov-jdk15on-158.jar \
      -storepass comcast123
