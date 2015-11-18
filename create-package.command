#!/bin/sh

name="enterprise-total"
path="packages/total.package"

thisdir="`dirname \"$0\"`"
cd "$thisdir" &&
cd "$path" &&
tpm create "$name".package &&
mv "$name".package ../../"$name".package &&
exit 0 ||
read -p "Some error occured, press [Enter] key to exit..."