#!/bin/sh

name="enterprise-total"

thisdir="`dirname \"$0\"`"
cd "$thisdir" &&
cd packages/"$name".package &&
tpm create "$name".package &&
mv "$name".package ../../"$name".package &&
exit 0 ||
read -p "Some error occured, press [Enter] key to exit..."