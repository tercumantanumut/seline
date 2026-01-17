[internal] load build definition from Dockerfile
	transferring 8799/0 0.004
[internal] load metadata for docker.io/nvidia/cuda:13.0.0-devel-ubuntu24.04
[internal] load .dockerignore
[ 1/18] FROM docker.io/nvidia/cuda:13.0.0-devel-ubuntu24.04@sha256:1e8ac7a54c184a1af8ef2167f28fa98281892a835c981ebcddb1fad04bdd452d
	resolve docker.io/nvidia/cuda:13.0.0-devel-ubuntu24.04@sha256:1e8ac7a54c184a1af8ef2167f28fa98281892a835c981ebcddb1fad04bdd452d 0/0 0.029
	sha256:5065c92eaa27f9fa100247b99dc946350ed4f7f2b4c5bf56da89df21462b7c4a 89735/89735 0.406
	sha256:04c1659590951cf4645f7fc21adeeb72ce204df3349b1b68e615ed5911f543d6 2306148233/2306148233 893.296
	sha256:932162d4fcf6e1094ee1544e8fde0ae2a02b2c4e9545f64f373ce3a4479189e6 1522/1522 1.699
	sha256:492db7b3e492442f7a1ad30fea534f61ad89da451c675ccab2488e41034d0886 1684/1684 0.599
	sha256:84fef9f1ca4f21e9c7411db3c57fe91a1f401d7051d87a3bfed97ff70a2cf72c 59610/59610 0.409
	sha256:1ba07b1309cf3cbf6f4649e357d9a21e94039b6100973ef20599eb4a11a8b338 1504706560/1505431138 undefined
	sha256:13e8f87efde86df96bfe73da211eb196d0416702b69d92947ec617138e6db64b 6885/6885 1.116
	sha256:ddc61996788ff6833bbe82138d6fc5000e848953b90df5055cbae21479218914 186/186 0.629
	sha256:0acb0bb33f9956b78fbfc026a81d9f3fbcf52f6c3c51ed7ff503b2f5db52d651 105068401/105068401 82.735
	sha256:9c9b39ad83d512d5af47e9c22f4458cb586f05ea478656a372c5e739cb7280e5 4547106/4547106 4.371
	sha256:32f112e3802cadcab3543160f4d2aa607b3cc1c62140d57b4f5441384f40e927 29721175/29721175 20.433
	extracting 0/0 0.708
	extracting 0/0 0.171
	extracting 0/0 1.108
	extracting 0/0 0.03
	extracting 0/0 0.029
	extracting 0/0 7.201
	extracting 0/0 0.029
	extracting 0/0 0.027
	extracting 0/0 0.032
	extracting 0/0 17.162
	extracting 0/0 2.258
[internal] load build context
	transferring 22043354492/0 1546.624
[ 2/18] RUN apt-get update && apt-get install -y --no-install-recommends     software-properties-common     && add-apt-repository -y ppa:deadsnakes/ppa     && apt-get update     && apt-get install -y --no-install-recommends     python3.13     python3.13-venv     python3.13-dev     python3-pip     git     curl     wget     jq     libgl1     libglib2.0-0     ca-certificates     && rm -rf /var/lib/apt/lists/*     && update-alternatives --install /usr/bin/python python /usr/bin/python3.13 1     && update-alternatives --install /usr/bin/python3 python3 /usr/bin/python3.13 1
	Get:1 http://archive.ubuntu.com/ubuntu noble InRelease [256 kB]
	Get:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]
	Get:3 http://security.ubuntu.com/ubuntu noble-security/main amd64 Packages [1769 kB]
	Get:4 http://archive.ubuntu.com/ubuntu noble-updates InRelease [126 kB]
	Get:5 http://archive.ubuntu.com/ubuntu noble-backports InRelease [126 kB]
	Get:6 http://security.ubuntu.com/ubuntu noble-security/universe amd64 Packages [1191 kB]
	Get:7 http://security.ubuntu.com/ubuntu noble-security/multiverse amd64 Packages [33.1 kB]
	Get:8 http://security.ubuntu.com/ubuntu noble-security/restricted amd64 Packages [2919 kB]
	Get:9 http://archive.ubuntu.com/ubuntu noble/universe amd64 Packages [19.3 MB]
	Get:10 https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64  InRelease [1581 B]
	Get:11 https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64  Packages [1159 kB]
	Get:12 http://archive.ubuntu.com/ubuntu noble/restricted amd64 Packages [117 kB]
	Get:13 http://archive.ubuntu.com/ubuntu noble/multiverse amd64 Packages [331 kB]
	Get:14 http://archive.ubuntu.com/ubuntu noble/main amd64 Packages [1808 kB]
	Get:15 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 Packages [2142 kB]
	Get:16 http://archive.ubuntu.com/ubuntu noble-updates/multiverse amd64 Packages [35.9 kB]
	Get:17 http://archive.ubuntu.com/ubuntu noble-updates/universe amd64 Packages [1959 kB]
	Get:18 http://archive.ubuntu.com/ubuntu noble-updates/restricted amd64 Packages [3077 kB]
	Get:19 http://archive.ubuntu.com/ubuntu noble-backports/universe amd64 Packages [34.6 kB]
	Get:20 http://archive.ubuntu.com/ubuntu noble-backports/main amd64 Packages [49.5 kB]
	Fetched 36.6 MB in 9s (4243 kB/s)
	Reading package lists...
	W: https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/InRelease: Key is stored in legacy trusted.gpg keyring (/etc/apt/trusted.gpg), see the DEPRECATION section in apt-key(8) for details.
	Reading package lists...
	Building dependency tree...
	Reading state information...
	The following additional packages will be installed:
	bsdutils dbus dbus-bin dbus-daemon dbus-session-bus-common
	dbus-system-bus-common distro-info-data gir1.2-girepository-2.0
	gir1.2-glib-2.0 gir1.2-packagekitglib-1.0 iso-codes libapparmor1
	libappstream5 libargon2-1 libblkid1 libbrotli1 libcap2-bin libcryptsetup12
	libcurl3t64-gnutls libdbus-1-3 libdevmapper1.02.1 libduktape207 libdw1t64
	libelf1t64 libexpat1 libfdisk1 libgirepository-1.0-1 libglib2.0-0t64
	libglib2.0-bin libglib2.0-data libgssapi-krb5-2 libgstreamer1.0-0 libicu74
	libjson-c5 libk5crypto3 libkeyutils1 libkmod2 libkrb5-3 libkrb5support0
	libmount1 libnghttp2-14 libpackagekit-glib2-18 libpam-systemd
	libpolkit-agent-1-0 libpolkit-gobject-1-0 libpsl5t64 libpython3-stdlib
	libpython3.12-minimal libpython3.12-stdlib librtmp1 libsmartcols1 libssh-4
	libstemmer0d libsystemd-shared libsystemd0 libudev1 libunwind8 libuuid1
	libxml2 libxmlb2 libyaml-0-2 lsb-release media-types mount netbase
	packagekit polkitd python-apt-common python3 python3-apt python3-blinker
	python3-cffi-backend python3-cryptography python3-dbus python3-distro
	python3-gi python3-httplib2 python3-jwt python3-launchpadlib
	python3-lazr.restfulclient python3-lazr.uri python3-minimal python3-oauthlib
	python3-pkg-resources python3-pyparsing python3-six
	python3-software-properties python3-wadllib python3.12 python3.12-minimal
	sgml-base systemd systemd-dev systemd-sysv tzdata util-linux xml-core
	Suggested packages:
	default-dbus-session-bus | dbus-session-bus isoquery low-memory-monitor
	krb5-doc krb5-user gstreamer1.0-tools cryptsetup-bin nfs-common polkitd-pkla
	python3-doc python3-tk python3-venv python-apt-doc python-blinker-doc
	python-cryptography-doc python3-cryptography-vectors python-dbus-doc
	python3-crypto python3-keyring python3-testresources python3-setuptools
	python-pyparsing-doc python3.12-venv python3.12-doc binfmt-support
	sgml-base-doc systemd-container systemd-homed systemd-userdbd systemd-boot
	libfido2-1 libip4tc2 libqrencode4 libtss2-esys-3.0.2-0 libtss2-mu-4.0.1-0
	libtss2-rc0 libtss2-tcti-device0 dosfstools kbd util-linux-extra
	util-linux-locales debhelper
	Recommended packages:
	bsdextrautils libpam-cap dmsetup shared-mime-info xdg-user-dirs krb5-locales
	dbus-user-session publicsuffix uuid-runtime appstream packagekit-tools
	unattended-upgrades networkd-dispatcher systemd-timesyncd | time-daemon
	systemd-resolved libnss-systemd
	The following NEW packages will be installed:
	dbus dbus-bin dbus-daemon dbus-session-bus-common dbus-system-bus-common
	distro-info-data gir1.2-girepository-2.0 gir1.2-glib-2.0
	gir1.2-packagekitglib-1.0 iso-codes libapparmor1 libappstream5 libargon2-1
	libbrotli1 libcap2-bin libcryptsetup12 libcurl3t64-gnutls libdbus-1-3
	libdevmapper1.02.1 libduktape207 libdw1t64 libelf1t64 libexpat1 libfdisk1
	libgirepository-1.0-1 libglib2.0-0t64 libglib2.0-bin libglib2.0-data
	libgssapi-krb5-2 libgstreamer1.0-0 libicu74 libjson-c5 libk5crypto3
	libkeyutils1 libkmod2 libkrb5-3 libkrb5support0 libnghttp2-14
	libpackagekit-glib2-18 libpam-systemd libpolkit-agent-1-0
	libpolkit-gobject-1-0 libpsl5t64 libpython3-stdlib libpython3.12-minimal
	libpython3.12-stdlib librtmp1 libssh-4 libstemmer0d libsystemd-shared
	libunwind8 libxml2 libxmlb2 libyaml-0-2 lsb-release media-types netbase
	packagekit polkitd python-apt-common python3 python3-apt python3-blinker
	python3-cffi-backend python3-cryptography python3-dbus python3-distro
	python3-gi python3-httplib2 python3-jwt python3-launchpadlib
	python3-lazr.restfulclient python3-lazr.uri python3-minimal python3-oauthlib
	python3-pkg-resources python3-pyparsing python3-six
	python3-software-properties python3-wadllib python3.12 python3.12-minimal
	sgml-base software-properties-common systemd systemd-dev systemd-sysv tzdata
	xml-core
	The following packages will be upgraded:
	bsdutils libblkid1 libmount1 libsmartcols1 libsystemd0 libudev1 libuuid1
	mount util-linux
	9 upgraded, 89 newly installed, 0 to remove and 90 not upgraded.
	Need to get 39.7 MB of archives.
	After this operation, 140 MB of additional disk space will be used.
	Get:1 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 bsdutils amd64 1:2.39.3-9ubuntu6.4 [95.6 kB]
	Get:2 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 util-linux amd64 2.39.3-9ubuntu6.4 [1128 kB]
	Get:3 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 mount amd64 2.39.3-9ubuntu6.4 [118 kB]
	Get:4 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpython3.12-minimal amd64 3.12.3-1ubuntu0.10 [836 kB]
	Get:5 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libexpat1 amd64 2.6.1-2ubuntu0.3 [88.0 kB]
	Get:6 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3.12-minimal amd64 3.12.3-1ubuntu0.10 [2335 kB]
	Get:7 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3-minimal amd64 3.12.3-0ubuntu2.1 [27.4 kB]
	Get:8 http://archive.ubuntu.com/ubuntu noble/main amd64 media-types all 10.1.0 [27.5 kB]
	Get:9 http://archive.ubuntu.com/ubuntu noble/main amd64 netbase all 6.4 [13.1 kB]
	Get:10 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 tzdata all 2025b-0ubuntu0.24.04.1 [276 kB]
	Get:11 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpython3.12-stdlib amd64 3.12.3-1ubuntu0.10 [2069 kB]
	Get:12 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3.12 amd64 3.12.3-1ubuntu0.10 [651 kB]
	Get:13 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpython3-stdlib amd64 3.12.3-0ubuntu2.1 [10.1 kB]
	Get:14 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3 amd64 3.12.3-0ubuntu2.1 [23.0 kB]
	Get:15 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libapparmor1 amd64 4.0.1really4.0.1-0ubuntu0.24.04.5 [50.5 kB]
	Get:16 http://archive.ubuntu.com/ubuntu noble/main amd64 libargon2-1 amd64 0~20190702+dfsg-4build1 [20.8 kB]
	Get:17 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libblkid1 amd64 2.39.3-9ubuntu6.4 [123 kB]
	Get:18 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libudev1 amd64 255.4-1ubuntu8.12 [177 kB]
	Get:19 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdevmapper1.02.1 amd64 2:1.02.185-3ubuntu3.2 [139 kB]
	Get:20 http://archive.ubuntu.com/ubuntu noble/main amd64 libjson-c5 amd64 0.17-1build1 [35.3 kB]
	Get:21 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libuuid1 amd64 2.39.3-9ubuntu6.4 [35.9 kB]
	Get:22 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libcryptsetup12 amd64 2:2.7.0-1ubuntu4.2 [266 kB]
	Get:23 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libfdisk1 amd64 2.39.3-9ubuntu6.4 [146 kB]
	Get:24 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libkmod2 amd64 31+20240202-2ubuntu7.1 [51.7 kB]
	Get:25 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libmount1 amd64 2.39.3-9ubuntu6.4 [134 kB]
	Get:26 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libsystemd-shared amd64 255.4-1ubuntu8.12 [2077 kB]
	Get:27 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libsystemd0 amd64 255.4-1ubuntu8.12 [435 kB]
	Get:28 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 systemd-dev all 255.4-1ubuntu8.12 [106 kB]
	Get:29 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 systemd amd64 255.4-1ubuntu8.12 [3475 kB]
	Get:30 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 systemd-sysv amd64 255.4-1ubuntu8.12 [11.9 kB]
	Get:31 http://archive.ubuntu.com/ubuntu noble/main amd64 sgml-base all 1.31 [11.4 kB]
	Get:32 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libsmartcols1 amd64 2.39.3-9ubuntu6.4 [65.6 kB]
	Get:33 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdbus-1-3 amd64 1.14.10-4ubuntu4.1 [210 kB]
	Get:34 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 dbus-bin amd64 1.14.10-4ubuntu4.1 [39.3 kB]
	Get:35 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 dbus-session-bus-common all 1.14.10-4ubuntu4.1 [80.5 kB]
	Get:36 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 dbus-daemon amd64 1.14.10-4ubuntu4.1 [118 kB]
	Get:37 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 dbus-system-bus-common all 1.14.10-4ubuntu4.1 [81.6 kB]
	Get:38 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 dbus amd64 1.14.10-4ubuntu4.1 [24.3 kB]
	Get:39 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 distro-info-data all 0.60ubuntu0.5 [6934 B]
	Get:40 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libglib2.0-0t64 amd64 2.80.0-6ubuntu3.6 [1545 kB]
	Get:41 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 gir1.2-glib-2.0 amd64 2.80.0-6ubuntu3.6 [183 kB]
	Get:42 http://archive.ubuntu.com/ubuntu noble/main amd64 libgirepository-1.0-1 amd64 1.80.1-1 [81.9 kB]
	Get:43 http://archive.ubuntu.com/ubuntu noble/main amd64 gir1.2-girepository-2.0 amd64 1.80.1-1 [24.5 kB]
	Get:44 http://archive.ubuntu.com/ubuntu noble/main amd64 iso-codes all 4.16.0-1 [3492 kB]
	Get:45 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libcap2-bin amd64 1:2.66-5ubuntu2.2 [34.2 kB]
	Get:46 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libelf1t64 amd64 0.190-1.1ubuntu0.1 [57.8 kB]
	Get:47 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libglib2.0-data all 2.80.0-6ubuntu3.6 [49.3 kB]
	Get:48 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libkrb5support0 amd64 1.20.1-6ubuntu2.6 [34.4 kB]
	Get:49 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libk5crypto3 amd64 1.20.1-6ubuntu2.6 [82.0 kB]
	Get:50 http://archive.ubuntu.com/ubuntu noble/main amd64 libkeyutils1 amd64 1.6.3-3build1 [9490 B]
	Get:51 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libkrb5-3 amd64 1.20.1-6ubuntu2.6 [348 kB]
	Get:52 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libgssapi-krb5-2 amd64 1.20.1-6ubuntu2.6 [143 kB]
	Get:53 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libicu74 amd64 74.2-1ubuntu3.1 [10.9 MB]
	Get:54 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpam-systemd amd64 255.4-1ubuntu8.12 [235 kB]
	Get:55 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libxml2 amd64 2.9.14+dfsg-1.3ubuntu3.6 [763 kB]
	Get:56 http://archive.ubuntu.com/ubuntu noble/main amd64 libyaml-0-2 amd64 0.2.5-1build1 [51.5 kB]
	Get:57 http://archive.ubuntu.com/ubuntu noble/main amd64 lsb-release all 12.0-2 [6564 B]
	Get:58 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python-apt-common all 2.7.7ubuntu5.1 [20.8 kB]
	Get:59 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3-apt amd64 2.7.7ubuntu5.1 [169 kB]
	Get:60 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-cffi-backend amd64 1.16.0-2build1 [77.3 kB]
	Get:61 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-dbus amd64 1.3.2-5build3 [100 kB]
	Get:62 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-gi amd64 3.48.2-1 [232 kB]
	Get:63 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3-pkg-resources all 68.1.2-2ubuntu1.2 [168 kB]
	Get:64 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libnghttp2-14 amd64 1.59.0-1ubuntu0.2 [74.3 kB]
	Get:65 http://archive.ubuntu.com/ubuntu noble/main amd64 libpsl5t64 amd64 0.21.2-1.1build1 [57.1 kB]
	Get:66 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpackagekit-glib2-18 amd64 1.2.8-2ubuntu1.4 [120 kB]
	Get:67 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 gir1.2-packagekitglib-1.0 amd64 1.2.8-2ubuntu1.4 [25.6 kB]
	Get:68 http://archive.ubuntu.com/ubuntu noble/main amd64 libbrotli1 amd64 1.1.0-2build2 [331 kB]
	Get:69 http://archive.ubuntu.com/ubuntu noble/main amd64 librtmp1 amd64 2.4+20151223.gitfa8646d.1-2build7 [56.3 kB]
	Get:70 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libssh-4 amd64 0.10.6-2ubuntu0.2 [188 kB]
	Get:71 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libcurl3t64-gnutls amd64 8.5.0-2ubuntu10.6 [333 kB]
	Get:72 http://archive.ubuntu.com/ubuntu noble/main amd64 libstemmer0d amd64 2.2.0-4build1 [161 kB]
	Get:73 http://archive.ubuntu.com/ubuntu noble/main amd64 libxmlb2 amd64 0.3.18-1 [67.7 kB]
	Get:74 http://archive.ubuntu.com/ubuntu noble/main amd64 libappstream5 amd64 1.0.2-1build6 [238 kB]
	Get:75 http://archive.ubuntu.com/ubuntu noble/main amd64 libduktape207 amd64 2.7.0+tests-0ubuntu3 [143 kB]
	Get:76 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdw1t64 amd64 0.190-1.1ubuntu0.1 [261 kB]
	Get:77 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libglib2.0-bin amd64 2.80.0-6ubuntu3.6 [98.3 kB]
	Get:78 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libunwind8 amd64 1.6.2-3build1.1 [55.3 kB]
	Get:79 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libgstreamer1.0-0 amd64 1.24.2-1ubuntu0.1 [1165 kB]
	Get:80 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpolkit-gobject-1-0 amd64 124-2ubuntu1.24.04.2 [49.1 kB]
	Get:81 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpolkit-agent-1-0 amd64 124-2ubuntu1.24.04.2 [17.4 kB]
	Get:82 http://archive.ubuntu.com/ubuntu noble/main amd64 xml-core all 0.19 [20.3 kB]
	Get:83 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 polkitd amd64 124-2ubuntu1.24.04.2 [95.2 kB]
	Get:84 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-blinker all 1.7.0-1 [14.3 kB]
	Get:85 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3-cryptography amd64 41.0.7-4ubuntu0.1 [810 kB]
	Get:86 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-pyparsing all 3.1.1-1 [86.2 kB]
	Get:87 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-httplib2 all 0.20.4-3 [30.4 kB]
	Get:88 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-jwt all 2.7.0-1 [20.9 kB]
	Get:89 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-lazr.uri all 1.0.6-3 [13.5 kB]
	Get:90 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-wadllib all 1.3.6-5 [35.9 kB]
	Get:91 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-distro all 1.9.0-1 [19.0 kB]
	Get:92 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-oauthlib all 3.2.2-1 [89.7 kB]
	Get:93 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-lazr.restfulclient all 0.14.6-1 [50.8 kB]
	Get:94 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-six all 1.16.0-4 [12.4 kB]
	Get:95 http://archive.ubuntu.com/ubuntu noble/main amd64 python3-launchpadlib all 1.11.0-6 [127 kB]
	Get:96 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3-software-properties all 0.99.49.3 [29.9 kB]
	Get:97 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 packagekit amd64 1.2.8-2ubuntu1.4 [434 kB]
	Get:98 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 software-properties-common all 0.99.49.3 [14.4 kB]
	debconf: delaying package configuration, since apt-utils is not installed
	Fetched 39.7 MB in 8s (4907 kB/s)
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%
(Reading database ... 40%
(Reading database ...45%
(Reading database ... 50%
(Reading database ... 55%(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 15486 files and directories currently installed.)
	Preparing to unpack .../bsdutils_1%3a2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking bsdutils (1:2.39.3-9ubuntu6.4) over (1:2.39.3-9ubuntu6.3) ...
	Setting up bsdutils (1:2.39.3-9ubuntu6.4) ...
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%(Reading database ... 20%
(Reading database ... 25%
(Reading database ...30%
(Reading database ... 35%(Reading database ... 40%
(Reading database ... 45%(Reading database ... 50%
(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 15486 files and directories currently installed.)
	Preparing to unpack .../util-linux_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking util-linux (2.39.3-9ubuntu6.4) over (2.39.3-9ubuntu6.3) ...
	Setting up util-linux (2.39.3-9ubuntu6.4) ...
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%
(Reading database ... 40%(Reading database ...45%
(Reading database ... 50%(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 15486 files and directories currently installed.)
	Preparing to unpack .../mount_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking mount (2.39.3-9ubuntu6.4) over (2.39.3-9ubuntu6.3) ...
	Selecting previously unselected package libpython3.12-minimal:amd64.
	Preparing to unpack .../libpython3.12-minimal_3.12.3-1ubuntu0.10_amd64.deb ...
	Unpacking libpython3.12-minimal:amd64 (3.12.3-1ubuntu0.10) ...
	Selecting previously unselected package libexpat1:amd64.
	Preparing to unpack .../libexpat1_2.6.1-2ubuntu0.3_amd64.deb ...
	Unpacking libexpat1:amd64 (2.6.1-2ubuntu0.3) ...
	Selecting previously unselected package python3.12-minimal.
	Preparing to unpack .../python3.12-minimal_3.12.3-1ubuntu0.10_amd64.deb ...
	Unpacking python3.12-minimal (3.12.3-1ubuntu0.10) ...
	Setting up libpython3.12-minimal:amd64 (3.12.3-1ubuntu0.10) ...
	Setting up libexpat1:amd64 (2.6.1-2ubuntu0.3) ...
	Setting up python3.12-minimal (3.12.3-1ubuntu0.10) ...
	Selecting previously unselected package python3-minimal.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%(Reading database ... 40%
(Reading database ... 45%(Reading database ... 50%(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 15805 files and directories currently installed.)
	Preparing to unpack .../0-python3-minimal_3.12.3-0ubuntu2.1_amd64.deb ...
	Unpacking python3-minimal (3.12.3-0ubuntu2.1) ...
	Selecting previously unselected package media-types.
	Preparing to unpack .../1-media-types_10.1.0_all.deb ...
	Unpacking media-types (10.1.0) ...
	Selecting previously unselected package netbase.
	Preparing to unpack .../2-netbase_6.4_all.deb ...
	Unpacking netbase (6.4) ...
	Selecting previously unselected package tzdata.
	Preparing to unpack .../3-tzdata_2025b-0ubuntu0.24.04.1_all.deb ...
	Unpacking tzdata (2025b-0ubuntu0.24.04.1) ...
	Selecting previously unselected package libpython3.12-stdlib:amd64.
	Preparing to unpack .../4-libpython3.12-stdlib_3.12.3-1ubuntu0.10_amd64.deb ...
	Unpacking libpython3.12-stdlib:amd64 (3.12.3-1ubuntu0.10) ...
	Selecting previously unselected package python3.12.
	Preparing to unpack .../5-python3.12_3.12.3-1ubuntu0.10_amd64.deb ...
	Unpacking python3.12 (3.12.3-1ubuntu0.10) ...
	Selecting previously unselected package libpython3-stdlib:amd64.
	Preparing to unpack .../6-libpython3-stdlib_3.12.3-0ubuntu2.1_amd64.deb ...
	Unpacking libpython3-stdlib:amd64 (3.12.3-0ubuntu2.1) ...
	Setting up python3-minimal (3.12.3-0ubuntu2.1) ...
	Selecting previously unselected package python3.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%(Reading database ...30%
(Reading database ... 35%
(Reading database ... 40%
(Reading database ... 45%(Reading database ... 50%
(Reading database ... 55%
(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 16774 files and directories currently installed.)
	Preparing to unpack .../python3_3.12.3-0ubuntu2.1_amd64.deb ...
	Unpacking python3 (3.12.3-0ubuntu2.1) ...
	Selecting previously unselected package libapparmor1:amd64.
	Preparing to unpack .../libapparmor1_4.0.1really4.0.1-0ubuntu0.24.04.5_amd64.deb ...
	Unpacking libapparmor1:amd64 (4.0.1really4.0.1-0ubuntu0.24.04.5) ...
	Selecting previously unselected package libargon2-1:amd64.
	Preparing to unpack .../libargon2-1_0~20190702+dfsg-4build1_amd64.deb ...
	Unpacking libargon2-1:amd64 (0~20190702+dfsg-4build1) ...
	Preparing to unpack .../libblkid1_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking libblkid1:amd64 (2.39.3-9ubuntu6.4) over (2.39.3-9ubuntu6.3) ...
	Setting up libblkid1:amd64 (2.39.3-9ubuntu6.4) ...
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%
(Reading database ... 40%(Reading database ... 45%
(Reading database ... 50%
(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 16804 files and directories currently installed.)
	Preparing to unpack .../libudev1_255.4-1ubuntu8.12_amd64.deb ...
	Unpacking libudev1:amd64 (255.4-1ubuntu8.12) over (255.4-1ubuntu8.8) ...
	Setting up libudev1:amd64 (255.4-1ubuntu8.12) ...
	Selecting previously unselected package libdevmapper1.02.1:amd64.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%
(Reading database ... 40%
(Reading database ... 45%
(Reading database ... 50%
(Reading database ... 55%
(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 16804 files and directories currently installed.)
	Preparing to unpack .../libdevmapper1.02.1_2%3a1.02.185-3ubuntu3.2_amd64.deb ...
	Unpacking libdevmapper1.02.1:amd64 (2:1.02.185-3ubuntu3.2) ...
	Selecting previously unselected package libjson-c5:amd64.
	Preparing to unpack .../libjson-c5_0.17-1build1_amd64.deb ...
	Unpacking libjson-c5:amd64 (0.17-1build1) ...
	Preparing to unpack .../libuuid1_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking libuuid1:amd64 (2.39.3-9ubuntu6.4) over (2.39.3-9ubuntu6.3) ...
	Setting up libuuid1:amd64 (2.39.3-9ubuntu6.4) ...
	Selecting previously unselected package libcryptsetup12:amd64.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%
(Reading database ... 40%(Reading database ... 45%(Reading database ... 50%
(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 16815 files and directories currently installed.)
	Preparing to unpack .../libcryptsetup12_2%3a2.7.0-1ubuntu4.2_amd64.deb ...
	Unpacking libcryptsetup12:amd64 (2:2.7.0-1ubuntu4.2) ...
	Selecting previously unselected package libfdisk1:amd64.
	Preparing to unpack .../libfdisk1_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking libfdisk1:amd64 (2.39.3-9ubuntu6.4) ...
	Selecting previously unselected package libkmod2:amd64.
	Preparing to unpack .../libkmod2_31+20240202-2ubuntu7.1_amd64.deb ...
	Unpacking libkmod2:amd64 (31+20240202-2ubuntu7.1) ...
	Preparing to unpack .../libmount1_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking libmount1:amd64 (2.39.3-9ubuntu6.4) over (2.39.3-9ubuntu6.3) ...
	Setting up libmount1:amd64 (2.39.3-9ubuntu6.4) ...
	Selecting previously unselected package libsystemd-shared:amd64.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ... 35%
(Reading database ... 40%(Reading database ... 45%
(Reading database ... 50%(Reading database ...55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 16835 files and directories currently installed.)
	Preparing to unpack .../libsystemd-shared_255.4-1ubuntu8.12_amd64.deb ...
	Unpacking libsystemd-shared:amd64 (255.4-1ubuntu8.12) ...
	Preparing to unpack .../libsystemd0_255.4-1ubuntu8.12_amd64.deb ...
	Unpacking libsystemd0:amd64 (255.4-1ubuntu8.12) over (255.4-1ubuntu8.8) ...
	Setting up libsystemd0:amd64 (255.4-1ubuntu8.12) ...
	Selecting previously unselected package systemd-dev.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%(Reading database ... 30%
(Reading database ... 35%
(Reading database ...40%
(Reading database ... 45%
(Reading database ... 50%
(Reading database ... 55%
(Reading database ...60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 16843 files and directories currently installed.)
	Preparing to unpack .../systemd-dev_255.4-1ubuntu8.12_all.deb ...
	Unpacking systemd-dev (255.4-1ubuntu8.12) ...
	Selecting previously unselected package systemd.
	Preparing to unpack .../systemd_255.4-1ubuntu8.12_amd64.deb ...
	Unpacking systemd (255.4-1ubuntu8.12) ...
	Setting up libapparmor1:amd64 (4.0.1really4.0.1-0ubuntu0.24.04.5) ...
	Setting up libargon2-1:amd64 (0~20190702+dfsg-4build1) ...
	Setting up libdevmapper1.02.1:amd64 (2:1.02.185-3ubuntu3.2) ...
	Setting up libjson-c5:amd64 (0.17-1build1) ...
	Setting up libcryptsetup12:amd64 (2:2.7.0-1ubuntu4.2) ...
	Setting up libfdisk1:amd64 (2.39.3-9ubuntu6.4) ...
	Setting up libkmod2:amd64 (31+20240202-2ubuntu7.1) ...
	Setting up libsystemd-shared:amd64 (255.4-1ubuntu8.12) ...
	Setting up systemd-dev (255.4-1ubuntu8.12) ...
	Setting up mount (2.39.3-9ubuntu6.4) ...
	Setting up systemd (255.4-1ubuntu8.12) ...
	Created symlink /etc/systemd/system/getty.target.wants/getty@tty1.service → /usr/lib/systemd/system/getty@.service.
	Created symlink /etc/systemd/system/multi-user.target.wants/remote-fs.target → /usr/lib/systemd/system/remote-fs.target.
	Created symlink /etc/systemd/system/sysinit.target.wants/systemd-pstore.service → /usr/lib/systemd/system/systemd-pstore.service.
	Initializing machine ID from random generator.
	/usr/lib/tmpfiles.d/systemd-network.conf:10: Failed to resolve user 'systemd-network': No such process
	/usr/lib/tmpfiles.d/systemd-network.conf:11: Failed to resolve user 'systemd-network': No such process
	/usr/lib/tmpfiles.d/systemd-network.conf:12: Failed to resolve user 'systemd-network': No such process
	/usr/lib/tmpfiles.d/systemd-network.conf:13: Failed to resolve user 'systemd-network': No such process
	/usr/lib/tmpfiles.d/systemd.conf:22: Failed to resolve group 'systemd-journal': No such process
	/usr/lib/tmpfiles.d/systemd.conf:23: Failed to resolve group 'systemd-journal': No such process
	/usr/lib/tmpfiles.d/systemd.conf:28: Failed to resolve group 'systemd-journal': No such process
	/usr/lib/tmpfiles.d/systemd.conf:29: Failed to resolve group 'systemd-journal': No such process
	/usr/lib/tmpfiles.d/systemd.conf:30: Failed to resolve group 'systemd-journal': No such process
	Creating group 'systemd-journal' with GID 999.
	Creating group 'systemd-network' with GID 998.
	Creating user 'systemd-network' (systemd Network Management) with UID 998 and GID 998.
	Selecting previously unselected package systemd-sysv.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%(Reading database ... 25%
(Reading database ... 30%(Reading database ... 35%
(Reading database ... 40%(Reading database ... 45%
(Reading database ...50%
(Reading database ... 55%
(Reading database ... 60%(Reading database ... 65%(Reading database ... 70%(Reading database ...75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 17821 files and directories currently installed.)
	Preparing to unpack .../systemd-sysv_255.4-1ubuntu8.12_amd64.deb ...
	Unpacking systemd-sysv (255.4-1ubuntu8.12) ...
	Selecting previously unselected package sgml-base.
	Preparing to unpack .../sgml-base_1.31_all.deb ...
	Unpacking sgml-base (1.31) ...
	Preparing to unpack .../libsmartcols1_2.39.3-9ubuntu6.4_amd64.deb ...
	Unpacking libsmartcols1:amd64 (2.39.3-9ubuntu6.4) over (2.39.3-9ubuntu6.3) ...
	Setting up libsmartcols1:amd64 (2.39.3-9ubuntu6.4) ...
	Selecting previously unselected package libdbus-1-3:amd64.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%
(Reading database ...35%
(Reading database ... 40%
(Reading database ... 45%
(Reading database ...50%
(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ...95%(Reading database ... 100%
(Reading database ... 17867 files and directories currently installed.)
	Preparing to unpack .../00-libdbus-1-3_1.14.10-4ubuntu4.1_amd64.deb ...
	Unpacking libdbus-1-3:amd64 (1.14.10-4ubuntu4.1) ...
	Selecting previously unselected package dbus-bin.
	Preparing to unpack .../01-dbus-bin_1.14.10-4ubuntu4.1_amd64.deb ...
	Unpacking dbus-bin (1.14.10-4ubuntu4.1) ...
	Selecting previously unselected package dbus-session-bus-common.
	Preparing to unpack .../02-dbus-session-bus-common_1.14.10-4ubuntu4.1_all.deb ...
	Unpacking dbus-session-bus-common (1.14.10-4ubuntu4.1) ...
	Selecting previously unselected package dbus-daemon.
	Preparing to unpack .../03-dbus-daemon_1.14.10-4ubuntu4.1_amd64.deb ...
	Unpacking dbus-daemon (1.14.10-4ubuntu4.1) ...
	Selecting previously unselected package dbus-system-bus-common.
	Preparing to unpack .../04-dbus-system-bus-common_1.14.10-4ubuntu4.1_all.deb ...
	Unpacking dbus-system-bus-common (1.14.10-4ubuntu4.1) ...
	Selecting previously unselected package dbus.
	Preparing to unpack .../05-dbus_1.14.10-4ubuntu4.1_amd64.deb ...
	Unpacking dbus (1.14.10-4ubuntu4.1) ...
	Selecting previously unselected package distro-info-data.
	Preparing to unpack .../06-distro-info-data_0.60ubuntu0.5_all.deb ...
	Unpacking distro-info-data (0.60ubuntu0.5) ...
	Selecting previously unselected package libglib2.0-0t64:amd64.
	Preparing to unpack .../07-libglib2.0-0t64_2.80.0-6ubuntu3.6_amd64.deb ...
	Unpacking libglib2.0-0t64:amd64 (2.80.0-6ubuntu3.6) ...
	Selecting previously unselected package gir1.2-glib-2.0:amd64.
	Preparing to unpack .../08-gir1.2-glib-2.0_2.80.0-6ubuntu3.6_amd64.deb ...
	Unpacking gir1.2-glib-2.0:amd64 (2.80.0-6ubuntu3.6) ...
	Selecting previously unselected package libgirepository-1.0-1:amd64.
	Preparing to unpack .../09-libgirepository-1.0-1_1.80.1-1_amd64.deb ...
	Unpacking libgirepository-1.0-1:amd64 (1.80.1-1) ...
	Selecting previously unselected package gir1.2-girepository-2.0:amd64.
	Preparing to unpack .../10-gir1.2-girepository-2.0_1.80.1-1_amd64.deb ...
	Unpacking gir1.2-girepository-2.0:amd64 (1.80.1-1) ...
	Selecting previously unselected package iso-codes.
	Preparing to unpack .../11-iso-codes_4.16.0-1_all.deb ...
	Unpacking iso-codes (4.16.0-1) ...
	Selecting previously unselected package libcap2-bin.
	Preparing to unpack .../12-libcap2-bin_1%3a2.66-5ubuntu2.2_amd64.deb ...
	Unpacking libcap2-bin (1:2.66-5ubuntu2.2) ...
	Selecting previously unselected package libelf1t64:amd64.
	Preparing to unpack .../13-libelf1t64_0.190-1.1ubuntu0.1_amd64.deb ...
	Unpacking libelf1t64:amd64 (0.190-1.1ubuntu0.1) ...
	Selecting previously unselected package libglib2.0-data.
	Preparing to unpack .../14-libglib2.0-data_2.80.0-6ubuntu3.6_all.deb ...
	Unpacking libglib2.0-data (2.80.0-6ubuntu3.6) ...
	Selecting previously unselected package libkrb5support0:amd64.
	Preparing to unpack .../15-libkrb5support0_1.20.1-6ubuntu2.6_amd64.deb ...
	Unpacking libkrb5support0:amd64 (1.20.1-6ubuntu2.6) ...
	Selecting previously unselected package libk5crypto3:amd64.
	Preparing to unpack .../16-libk5crypto3_1.20.1-6ubuntu2.6_amd64.deb ...
	Unpacking libk5crypto3:amd64 (1.20.1-6ubuntu2.6) ...
	Selecting previously unselected package libkeyutils1:amd64.
	Preparing to unpack .../17-libkeyutils1_1.6.3-3build1_amd64.deb ...
	Unpacking libkeyutils1:amd64 (1.6.3-3build1) ...
	Selecting previously unselected package libkrb5-3:amd64.
	Preparing to unpack .../18-libkrb5-3_1.20.1-6ubuntu2.6_amd64.deb ...
	Unpacking libkrb5-3:amd64 (1.20.1-6ubuntu2.6) ...
	Selecting previously unselected package libgssapi-krb5-2:amd64.
	Preparing to unpack .../19-libgssapi-krb5-2_1.20.1-6ubuntu2.6_amd64.deb ...
	Unpacking libgssapi-krb5-2:amd64 (1.20.1-6ubuntu2.6) ...
	Selecting previously unselected package libicu74:amd64.
	Preparing to unpack .../20-libicu74_74.2-1ubuntu3.1_amd64.deb ...
	Unpacking libicu74:amd64 (74.2-1ubuntu3.1) ...
	Selecting previously unselected package libpam-systemd:amd64.
	Preparing to unpack .../21-libpam-systemd_255.4-1ubuntu8.12_amd64.deb ...
	Unpacking libpam-systemd:amd64 (255.4-1ubuntu8.12) ...
	Selecting previously unselected package libxml2:amd64.
	Preparing to unpack .../22-libxml2_2.9.14+dfsg-1.3ubuntu3.6_amd64.deb ...
	Unpacking libxml2:amd64 (2.9.14+dfsg-1.3ubuntu3.6) ...
	Selecting previously unselected package libyaml-0-2:amd64.
	Preparing to unpack .../23-libyaml-0-2_0.2.5-1build1_amd64.deb ...
	Unpacking libyaml-0-2:amd64 (0.2.5-1build1) ...
	Selecting previously unselected package lsb-release.
	Preparing to unpack .../24-lsb-release_12.0-2_all.deb ...
	Unpacking lsb-release (12.0-2) ...
	Selecting previously unselected package python-apt-common.
	Preparing to unpack .../25-python-apt-common_2.7.7ubuntu5.1_all.deb ...
	Unpacking python-apt-common (2.7.7ubuntu5.1) ...
	Selecting previously unselected package python3-apt.
	Preparing to unpack .../26-python3-apt_2.7.7ubuntu5.1_amd64.deb ...
	Unpacking python3-apt (2.7.7ubuntu5.1) ...
	Selecting previously unselected package python3-cffi-backend:amd64.
	Preparing to unpack .../27-python3-cffi-backend_1.16.0-2build1_amd64.deb ...
	Unpacking python3-cffi-backend:amd64 (1.16.0-2build1) ...
	Selecting previously unselected package python3-dbus.
	Preparing to unpack .../28-python3-dbus_1.3.2-5build3_amd64.deb ...
	Unpacking python3-dbus (1.3.2-5build3) ...
	Selecting previously unselected package python3-gi.
	Preparing to unpack .../29-python3-gi_3.48.2-1_amd64.deb ...
	Unpacking python3-gi (3.48.2-1) ...
	Selecting previously unselected package python3-pkg-resources.
	Preparing to unpack .../30-python3-pkg-resources_68.1.2-2ubuntu1.2_all.deb ...
	Unpacking python3-pkg-resources (68.1.2-2ubuntu1.2) ...
	Selecting previously unselected package libnghttp2-14:amd64.
	Preparing to unpack .../31-libnghttp2-14_1.59.0-1ubuntu0.2_amd64.deb ...
	Unpacking libnghttp2-14:amd64 (1.59.0-1ubuntu0.2) ...
	Selecting previously unselected package libpsl5t64:amd64.
	Preparing to unpack .../32-libpsl5t64_0.21.2-1.1build1_amd64.deb ...
	Unpacking libpsl5t64:amd64 (0.21.2-1.1build1) ...
	Selecting previously unselected package libpackagekit-glib2-18:amd64.
	Preparing to unpack .../33-libpackagekit-glib2-18_1.2.8-2ubuntu1.4_amd64.deb ...
	Unpacking libpackagekit-glib2-18:amd64 (1.2.8-2ubuntu1.4) ...
	Selecting previously unselected package gir1.2-packagekitglib-1.0.
	Preparing to unpack .../34-gir1.2-packagekitglib-1.0_1.2.8-2ubuntu1.4_amd64.deb ...
	Unpacking gir1.2-packagekitglib-1.0 (1.2.8-2ubuntu1.4) ...
	Selecting previously unselected package libbrotli1:amd64.
	Preparing to unpack .../35-libbrotli1_1.1.0-2build2_amd64.deb ...
	Unpacking libbrotli1:amd64 (1.1.0-2build2) ...
	Selecting previously unselected package librtmp1:amd64.
	Preparing to unpack .../36-librtmp1_2.4+20151223.gitfa8646d.1-2build7_amd64.deb ...
	Unpacking librtmp1:amd64 (2.4+20151223.gitfa8646d.1-2build7) ...
	Selecting previously unselected package libssh-4:amd64.
	Preparing to unpack .../37-libssh-4_0.10.6-2ubuntu0.2_amd64.deb ...
	Unpacking libssh-4:amd64 (0.10.6-2ubuntu0.2) ...
	Selecting previously unselected package libcurl3t64-gnutls:amd64.
	Preparing to unpack .../38-libcurl3t64-gnutls_8.5.0-2ubuntu10.6_amd64.deb ...
	Unpacking libcurl3t64-gnutls:amd64 (8.5.0-2ubuntu10.6) ...
	Selecting previously unselected package libstemmer0d:amd64.
	Preparing to unpack .../39-libstemmer0d_2.2.0-4build1_amd64.deb ...
	Unpacking libstemmer0d:amd64 (2.2.0-4build1) ...
	Selecting previously unselected package libxmlb2:amd64.
	Preparing to unpack .../40-libxmlb2_0.3.18-1_amd64.deb ...
	Unpacking libxmlb2:amd64 (0.3.18-1) ...
	Selecting previously unselected package libappstream5:amd64.
	Preparing to unpack .../41-libappstream5_1.0.2-1build6_amd64.deb ...
	Unpacking libappstream5:amd64 (1.0.2-1build6) ...
	Selecting previously unselected package libduktape207:amd64.
	Preparing to unpack .../42-libduktape207_2.7.0+tests-0ubuntu3_amd64.deb ...
	Unpacking libduktape207:amd64 (2.7.0+tests-0ubuntu3) ...
	Selecting previously unselected package libdw1t64:amd64.
	Preparing to unpack .../43-libdw1t64_0.190-1.1ubuntu0.1_amd64.deb ...
	Unpacking libdw1t64:amd64 (0.190-1.1ubuntu0.1) ...
	Selecting previously unselected package libglib2.0-bin.
	Preparing to unpack .../44-libglib2.0-bin_2.80.0-6ubuntu3.6_amd64.deb ...
	Unpacking libglib2.0-bin (2.80.0-6ubuntu3.6) ...
	Selecting previously unselected package libunwind8:amd64.
	Preparing to unpack .../45-libunwind8_1.6.2-3build1.1_amd64.deb ...
	Unpacking libunwind8:amd64 (1.6.2-3build1.1) ...
	Selecting previously unselected package libgstreamer1.0-0:amd64.
	Preparing to unpack .../46-libgstreamer1.0-0_1.24.2-1ubuntu0.1_amd64.deb ...
	Unpacking libgstreamer1.0-0:amd64 (1.24.2-1ubuntu0.1) ...
	Selecting previously unselected package libpolkit-gobject-1-0:amd64.
	Preparing to unpack .../47-libpolkit-gobject-1-0_124-2ubuntu1.24.04.2_amd64.deb ...
	Unpacking libpolkit-gobject-1-0:amd64 (124-2ubuntu1.24.04.2) ...
	Selecting previously unselected package libpolkit-agent-1-0:amd64.
	Preparing to unpack .../48-libpolkit-agent-1-0_124-2ubuntu1.24.04.2_amd64.deb ...
	Unpacking libpolkit-agent-1-0:amd64 (124-2ubuntu1.24.04.2) ...
	Selecting previously unselected package xml-core.
	Preparing to unpack .../49-xml-core_0.19_all.deb ...
	Unpacking xml-core (0.19) ...
	Selecting previously unselected package polkitd.
	Preparing to unpack .../50-polkitd_124-2ubuntu1.24.04.2_amd64.deb ...
	Unpacking polkitd (124-2ubuntu1.24.04.2) ...
	Selecting previously unselected package python3-blinker.
	Preparing to unpack .../51-python3-blinker_1.7.0-1_all.deb ...
	Unpacking python3-blinker (1.7.0-1) ...
	Selecting previously unselected package python3-cryptography.
	Preparing to unpack .../52-python3-cryptography_41.0.7-4ubuntu0.1_amd64.deb ...
	Unpacking python3-cryptography (41.0.7-4ubuntu0.1) ...
	Selecting previously unselected package python3-pyparsing.
	Preparing to unpack .../53-python3-pyparsing_3.1.1-1_all.deb ...
	Unpacking python3-pyparsing (3.1.1-1) ...
	Selecting previously unselected package python3-httplib2.
	Preparing to unpack .../54-python3-httplib2_0.20.4-3_all.deb ...
	Unpacking python3-httplib2 (0.20.4-3) ...
	Selecting previously unselected package python3-jwt.
	Preparing to unpack .../55-python3-jwt_2.7.0-1_all.deb ...
	Unpacking python3-jwt (2.7.0-1) ...
	Selecting previously unselected package python3-lazr.uri.
	Preparing to unpack .../56-python3-lazr.uri_1.0.6-3_all.deb ...
	Unpacking python3-lazr.uri (1.0.6-3) ...
	Selecting previously unselected package python3-wadllib.
	Preparing to unpack .../57-python3-wadllib_1.3.6-5_all.deb ...
	Unpacking python3-wadllib (1.3.6-5) ...
	Selecting previously unselected package python3-distro.
	Preparing to unpack .../58-python3-distro_1.9.0-1_all.deb ...
	Unpacking python3-distro (1.9.0-1) ...
	Selecting previously unselected package python3-oauthlib.
	Preparing to unpack .../59-python3-oauthlib_3.2.2-1_all.deb ...
	Unpacking python3-oauthlib (3.2.2-1) ...
	Selecting previously unselected package python3-lazr.restfulclient.
	Preparing to unpack .../60-python3-lazr.restfulclient_0.14.6-1_all.deb ...
	Unpacking python3-lazr.restfulclient (0.14.6-1) ...
	Selecting previously unselected package python3-six.
	Preparing to unpack .../61-python3-six_1.16.0-4_all.deb ...
	Unpacking python3-six (1.16.0-4) ...
	Selecting previously unselected package python3-launchpadlib.
	Preparing to unpack .../62-python3-launchpadlib_1.11.0-6_all.deb ...
	Unpacking python3-launchpadlib (1.11.0-6) ...
	Selecting previously unselected package python3-software-properties.
	Preparing to unpack .../63-python3-software-properties_0.99.49.3_all.deb ...
	Unpacking python3-software-properties (0.99.49.3) ...
	Selecting previously unselected package packagekit.
	Preparing to unpack .../64-packagekit_1.2.8-2ubuntu1.4_amd64.deb ...
	Unpacking packagekit (1.2.8-2ubuntu1.4) ...
	Selecting previously unselected package software-properties-common.
	Preparing to unpack .../65-software-properties-common_0.99.49.3_all.deb ...
	Unpacking software-properties-common (0.99.49.3) ...
	Setting up media-types (10.1.0) ...
	Setting up systemd-sysv (255.4-1ubuntu8.12) ...
	Setting up libkeyutils1:amd64 (1.6.3-3build1) ...
	Setting up libyaml-0-2:amd64 (0.2.5-1build1) ...
	Setting up distro-info-data (0.60ubuntu0.5) ...
	Setting up libbrotli1:amd64 (1.1.0-2build2) ...
	Setting up libpsl5t64:amd64 (0.21.2-1.1build1) ...
	Setting up libnghttp2-14:amd64 (1.59.0-1ubuntu0.2) ...
	Setting up libunwind8:amd64 (1.6.2-3build1.1) ...
	Setting up libelf1t64:amd64 (0.190-1.1ubuntu0.1) ...
	Setting up libkrb5support0:amd64 (1.20.1-6ubuntu2.6) ...
	Setting up libdw1t64:amd64 (0.190-1.1ubuntu0.1) ...
	Setting up tzdata (2025b-0ubuntu0.24.04.1) ...
	
	Current default time zone: 'Etc/UTC'
	Local time is now:      Sat Jan 17 16:55:13 UTC 2026.
	Universal Time is now:  Sat Jan 17 16:55:13 UTC 2026.
	Run 'dpkg-reconfigure tzdata' if you wish to change it.
	Setting up libcap2-bin (1:2.66-5ubuntu2.2) ...
	Setting up libglib2.0-0t64:amd64 (2.80.0-6ubuntu3.6) ...
	No schema files found: doing nothing.
	Setting up libglib2.0-data (2.80.0-6ubuntu3.6) ...
	Setting up librtmp1:amd64 (2.4+20151223.gitfa8646d.1-2build7) ...
	Setting up libdbus-1-3:amd64 (1.14.10-4ubuntu4.1) ...
	Setting up gir1.2-glib-2.0:amd64 (2.80.0-6ubuntu3.6) ...
	Setting up libk5crypto3:amd64 (1.20.1-6ubuntu2.6) ...
	Setting up libicu74:amd64 (74.2-1ubuntu3.1) ...
	Setting up python-apt-common (2.7.7ubuntu5.1) ...
	Setting up libduktape207:amd64 (2.7.0+tests-0ubuntu3) ...
	Setting up dbus-session-bus-common (1.14.10-4ubuntu4.1) ...
	Setting up libgirepository-1.0-1:amd64 (1.80.1-1) ...
	Setting up netbase (6.4) ...
	Setting up sgml-base (1.31) ...
	Setting up libkrb5-3:amd64 (1.20.1-6ubuntu2.6) ...
	Setting up libstemmer0d:amd64 (2.2.0-4build1) ...
	Setting up lsb-release (12.0-2) ...
	Setting up dbus-system-bus-common (1.14.10-4ubuntu4.1) ...
	Setting up libxml2:amd64 (2.9.14+dfsg-1.3ubuntu3.6) ...
	Setting up iso-codes (4.16.0-1) ...
	Setting up dbus-bin (1.14.10-4ubuntu4.1) ...
	Setting up libpolkit-gobject-1-0:amd64 (124-2ubuntu1.24.04.2) ...
	Setting up libgstreamer1.0-0:amd64 (1.24.2-1ubuntu0.1) ...
	Setcap worked! gst-ptp-helper is not suid!
	Setting up libpython3.12-stdlib:amd64 (3.12.3-1ubuntu0.10) ...
	Setting up libxmlb2:amd64 (0.3.18-1) ...
	Setting up python3.12 (3.12.3-1ubuntu0.10) ...
	Setting up libglib2.0-bin (2.80.0-6ubuntu3.6) ...
	Setting up libpackagekit-glib2-18:amd64 (1.2.8-2ubuntu1.4) ...
	Setting up dbus-daemon (1.14.10-4ubuntu4.1) ...
	Setting up gir1.2-packagekitglib-1.0 (1.2.8-2ubuntu1.4) ...
	Setting up gir1.2-girepository-2.0:amd64 (1.80.1-1) ...
	Setting up dbus (1.14.10-4ubuntu4.1) ...
	Setting up libgssapi-krb5-2:amd64 (1.20.1-6ubuntu2.6) ...
	Setting up libssh-4:amd64 (0.10.6-2ubuntu0.2) ...
	Setting up xml-core (0.19) ...
	Setting up libpam-systemd:amd64 (255.4-1ubuntu8.12) ...
	Setting up libpolkit-agent-1-0:amd64 (124-2ubuntu1.24.04.2) ...
	Setting up libpython3-stdlib:amd64 (3.12.3-0ubuntu2.1) ...
	Setting up libcurl3t64-gnutls:amd64 (8.5.0-2ubuntu10.6) ...
	Setting up libappstream5:amd64 (1.0.2-1build6) ...
	Setting up python3 (3.12.3-0ubuntu2.1) ...
	Setting up python3-six (1.16.0-4) ...
	Setting up python3-pyparsing (3.1.1-1) ...
	Setting up python3-gi (3.48.2-1) ...
	Setting up python3-httplib2 (0.20.4-3) ...
	Setting up python3-cffi-backend:amd64 (1.16.0-2build1) ...
	Setting up python3-blinker (1.7.0-1) ...
	Setting up python3-pkg-resources (68.1.2-2ubuntu1.2) ...
	Setting up python3-dbus (1.3.2-5build3) ...
	Setting up python3-distro (1.9.0-1) ...
	Setting up python3-jwt (2.7.0-1) ...
	Setting up python3-apt (2.7.7ubuntu5.1) ...
	Setting up python3-lazr.uri (1.0.6-3) ...
	Setting up python3-cryptography (41.0.7-4ubuntu0.1) ...
	Setting up python3-wadllib (1.3.6-5) ...
	Setting up python3-oauthlib (3.2.2-1) ...
	Setting up python3-lazr.restfulclient (0.14.6-1) ...
	Setting up python3-launchpadlib (1.11.0-6) ...
	Created symlink /etc/systemd/user/timers.target.wants/launchpadlib-cache-clean.timer → /usr/lib/systemd/user/launchpadlib-cache-clean.timer.
	Setting up python3-software-properties (0.99.49.3) ...
	Processing triggers for libc-bin (2.39-0ubuntu8.5) ...
	Processing triggers for sgml-base (1.31) ...
	Setting up polkitd (124-2ubuntu1.24.04.2) ...
	Creating group 'polkitd' with GID 997.
	Creating user 'polkitd' (User for polkitd) with UID 997 and GID 997.
	invoke-rc.d: could not determine current runlevel
	invoke-rc.d: policy-rc.d denied execution of reload.
	start-stop-daemon: unable to stat /usr/libexec/polkitd (No such file or directory)
	Setting up packagekit (1.2.8-2ubuntu1.4) ...
	invoke-rc.d: could not determine current runlevel
	invoke-rc.d: policy-rc.d denied execution of force-reload.
	Failed to open connection to "system" message bus: Failed to connect to socket /run/dbus/system_bus_socket: No such file or directory
	Created symlink /etc/systemd/user/sockets.target.wants/pk-debconf-helper.socket → /usr/lib/systemd/user/pk-debconf-helper.socket.
	Setting up software-properties-common (0.99.49.3) ...
	Processing triggers for dbus (1.14.10-4ubuntu4.1) ...
	Repository: 'Types: deb
	URIs: https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu/
	Suites: noble
	Components: main
	'
	Description:
	This PPA contains more recent Python versions packaged for Ubuntu.
	
	Disclaimer: there's no guarantee of timely updates in case of security problems or other issues. If you want to use them in a security-or-otherwise-critical environment (say, on a production server), you do so at your own risk.
	
	Update Note
	===========
	Please use this repository instead of ppa:fkrull/deadsnakes.
	
	Reporting Issues
	================
	
	Issues can be reported in the master issue tracker at:
	https://github.com/deadsnakes/issues/issues
	
	Supported Ubuntu and Python Versions
	====================================
	
	- Ubuntu 22.04 (jammy) Python3.7 - Python3.9, Python3.11 - Python3.13
	- Ubuntu 24.04 (noble) Python3.7 - Python3.11, Python3.13
	- Note: Python 3.10 (jammy), Python3.12 (noble) are not provided by deadsnakes as upstream ubuntu provides those packages.
	
	Why some packages aren't built:
	- Note: for jammy and noble, older python versions requre libssl<3 so they are not currently built
	- If you need these, reach out to asottile to set up a private ppa
	
	The packages may also work on other versions of Ubuntu or Debian, but that is not tested or supported.
	
	Packages
	========
	
	The packages provided here are loosely based on the debian upstream packages with some modifications to make them more usable as non-default pythons and on ubuntu.  As such, the packages follow debian's patterns and often do not include a full python distribution with just `apt install python#.#`.  Here is a list of packages that may be useful along with the default install:
	
	- `python#.#-dev`: includes development headers for building C extensions
	- `python#.#-venv`: provides the standard library `venv` module
	- `python#.#-distutils`: provides the standard library `distutils` module
	- `python#.#-lib2to3`: provides the `2to3-#.#` utility as well as the standard library `lib2to3` module
	- `python#.#-gdbm`: provides the standard library `dbm.gnu` module
	- `python#.#-tk`: provides the standard library `tkinter` module
	
	Third-Party Python Modules
	==========================
	
	Python modules in the official Ubuntu repositories are packaged to work with the Python interpreters from the official repositories. Accordingly, they generally won't work with the Python interpreters from this PPA. As an exception, pure-Python modules for Python 3 will work, but any compiled extension modules won't.
	
	To install 3rd-party Python modules, you should use the common Python packaging tools.  For an introduction into the Python packaging ecosystem and its tools, refer to the Python Packaging User Guide:
	https://packaging.python.org/installing/
	
	Sources
	=======
	The package sources are available at:
	https://github.com/deadsnakes/
	
	Nightly Builds
	==============
	
	For nightly builds, see ppa:deadsnakes/nightly https://launchpad.net/~deadsnakes/+archive/ubuntu/nightly
	More info: https://launchpad.net/~deadsnakes/+archive/ubuntu/ppa
	Adding repository.
	Hit:1 http://security.ubuntu.com/ubuntu noble-security InRelease
	Hit:2 http://archive.ubuntu.com/ubuntu noble InRelease
	Hit:3 http://archive.ubuntu.com/ubuntu noble-updates InRelease
	Hit:4 http://archive.ubuntu.com/ubuntu noble-backports InRelease
	Get:5 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble InRelease [17.8 kB]
	Get:6 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 Packages [39.9 kB]
	Hit:7 https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64  InRelease
	Fetched 57.7 kB in 3s (20.9 kB/s)
	Reading package lists...
	W: https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/InRelease: Key is stored in legacy trusted.gpg keyring (/etc/apt/trusted.gpg), see the DEPRECATION section in apt-key(8) for details.
	Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease
	Hit:2 http://security.ubuntu.com/ubuntu noble-security InRelease
	Hit:3 http://archive.ubuntu.com/ubuntu noble-updates InRelease
	Hit:4 http://archive.ubuntu.com/ubuntu noble-backports InRelease
	Hit:5 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble InRelease
	Hit:6 https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64  InRelease
	Reading package lists...
	W: https://developer.download.nvidia.com/compute/cuda/repos/ubuntu2404/x86_64/InRelease: Key is stored in legacy trusted.gpg keyring (/etc/apt/trusted.gpg), see the DEPRECATION section in apt-key(8) for details.
	Reading package lists...
	Building dependency tree...
	Reading state information...
	libglib2.0-0t64 is already the newest version (2.80.0-6ubuntu3.6).
	libglib2.0-0t64 set to manually installed.
	ca-certificates is already the newest version (20240203).
	The following additional packages will be installed:
	git-man libbsd0 libcurl4t64 libdrm-amdgpu1 libdrm-common libdrm-intel1
	libdrm2 libedit2 liberror-perl libexpat1-dev libgbm1 libgl1-mesa-dri
	libglvnd0 libglx-mesa0 libglx0 libjq1 libllvm20 libonig5 libpciaccess0
	libpython3.13 libpython3.13-dev libpython3.13-stdlib libsensors-config
	libsensors5 libvulkan1 libwayland-server0 libx11-6 libx11-data libx11-xcb1
	libxau6 libxcb-dri3-0 libxcb-glx0 libxcb-present0 libxcb-randr0 libxcb-shm0
	libxcb-sync1 libxcb-xfixes0 libxcb1 libxdmcp6 libxext6 libxshmfence1
	libxxf86vm1 mesa-libgallium python3-setuptools python3-wheel
	Suggested packages:
	gettext-base git-daemon-run | git-daemon-sysvinit git-doc git-email git-gui
	gitk gitweb git-cvs git-mediawiki git-svn pciutils lm-sensors
	python-setuptools-doc
	Recommended packages:
	less ssh-client mesa-vulkan-drivers | vulkan-icd python3-dev
	The following NEW packages will be installed:
	curl git git-man jq libbsd0 libcurl4t64 libdrm-amdgpu1 libdrm-common
	libdrm-intel1 libdrm2 libedit2 liberror-perl libexpat1-dev libgbm1 libgl1
	libgl1-mesa-dri libglvnd0 libglx-mesa0 libglx0 libjq1 libllvm20 libonig5
	libpciaccess0 libpython3.13 libpython3.13-dev libpython3.13-stdlib
	libsensors-config libsensors5 libvulkan1 libwayland-server0 libx11-6
	libx11-data libx11-xcb1 libxau6 libxcb-dri3-0 libxcb-glx0 libxcb-present0
	libxcb-randr0 libxcb-shm0 libxcb-sync1 libxcb-xfixes0 libxcb1 libxdmcp6
	libxext6 libxshmfence1 libxxf86vm1 mesa-libgallium python3-pip
	python3-setuptools python3-wheel python3.13 python3.13-dev python3.13-venv
	wget
	0 upgraded, 54 newly installed, 0 to remove and 90 not upgraded.
	Need to get 65.8 MB of archives.
	After this operation, 288 MB of additional disk space will be used.
	Get:1 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libbsd0 amd64 0.12.1-1build1.1 [41.2 kB]
	Get:2 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdrm-common all 2.4.122-1~ubuntu0.24.04.2 [8464 B]
	Get:3 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdrm2 amd64 2.4.122-1~ubuntu0.24.04.2 [40.6 kB]
	Get:4 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 libpython3.13-stdlib amd64 3.13.11-1+noble1 [2875 kB]
	Get:5 http://archive.ubuntu.com/ubuntu noble/main amd64 libedit2 amd64 3.1-20230828-1build1 [97.6 kB]
	Get:6 http://archive.ubuntu.com/ubuntu noble/main amd64 libsensors-config all 1:3.6.0-9build1 [5546 B]
	Get:7 http://archive.ubuntu.com/ubuntu noble/main amd64 libsensors5 amd64 1:3.6.0-9build1 [26.6 kB]
	Get:8 http://archive.ubuntu.com/ubuntu noble/main amd64 libxau6 amd64 1:1.0.9-1build6 [7160 B]
	Get:9 http://archive.ubuntu.com/ubuntu noble/main amd64 libxdmcp6 amd64 1:1.1.3-0ubuntu6 [10.3 kB]
	Get:10 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb1 amd64 1.15-1ubuntu2 [47.7 kB]
	Get:11 http://archive.ubuntu.com/ubuntu noble/main amd64 libx11-data all 2:1.8.7-1build1 [115 kB]
	Get:12 http://archive.ubuntu.com/ubuntu noble/main amd64 libx11-6 amd64 2:1.8.7-1build1 [650 kB]
	Get:13 http://archive.ubuntu.com/ubuntu noble/main amd64 libxext6 amd64 2:1.3.4-1build2 [30.4 kB]
	Get:14 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 wget amd64 1.21.4-1ubuntu4.1 [334 kB]
	Get:15 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libcurl4t64 amd64 8.5.0-2ubuntu10.6 [341 kB]
	Get:16 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 curl amd64 8.5.0-2ubuntu10.6 [226 kB]
	Get:17 http://archive.ubuntu.com/ubuntu noble/main amd64 liberror-perl all 0.17029-2 [25.6 kB]
	Get:18 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 git-man all 1:2.43.0-1ubuntu7.3 [1100 kB]
	Get:19 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 git amd64 1:2.43.0-1ubuntu7.3 [3680 kB]
	Get:20 http://archive.ubuntu.com/ubuntu noble/main amd64 libonig5 amd64 6.9.9-1build1 [172 kB]
	Get:21 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libjq1 amd64 1.7.1-3ubuntu0.24.04.1 [141 kB]
	Get:22 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 jq amd64 1.7.1-3ubuntu0.24.04.1 [65.7 kB]
	Get:23 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdrm-amdgpu1 amd64 2.4.122-1~ubuntu0.24.04.2 [20.9 kB]
	Get:24 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libpciaccess0 amd64 0.17-3ubuntu0.24.04.2 [18.9 kB]
	Get:25 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libdrm-intel1 amd64 2.4.122-1~ubuntu0.24.04.2 [63.8 kB]
	Get:26 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libexpat1-dev amd64 2.6.1-2ubuntu0.3 [140 kB]
	Get:27 http://archive.ubuntu.com/ubuntu noble/main amd64 libwayland-server0 amd64 1.22.0-2.1build1 [33.9 kB]
	Get:28 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libllvm20 amd64 1:20.1.2-0ubuntu1~24.04.2 [30.6 MB]
	Get:29 http://archive.ubuntu.com/ubuntu noble/main amd64 libx11-xcb1 amd64 2:1.8.7-1build1 [7800 B]
	Get:30 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-dri3-0 amd64 1.15-1ubuntu2 [7142 B]
	Get:31 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-present0 amd64 1.15-1ubuntu2 [5676 B]
	Get:32 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-randr0 amd64 1.15-1ubuntu2 [17.9 kB]
	Get:33 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-sync1 amd64 1.15-1ubuntu2 [9312 B]
	Get:34 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-xfixes0 amd64 1.15-1ubuntu2 [10.2 kB]
	Get:35 http://archive.ubuntu.com/ubuntu noble/main amd64 libxshmfence1 amd64 1.3-1build5 [4764 B]
	Get:36 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 mesa-libgallium amd64 25.0.7-0ubuntu0.24.04.2 [10.3 MB]
	Get:37 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 libpython3.13 amd64 3.13.11-1+noble1 [2290 kB]
	Get:38 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libgbm1 amd64 25.0.7-0ubuntu0.24.04.2 [32.7 kB]
	Get:39 http://archive.ubuntu.com/ubuntu noble/main amd64 libvulkan1 amd64 1.3.275.0-1build1 [142 kB]
	Get:40 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libgl1-mesa-dri amd64 25.0.7-0ubuntu0.24.04.2 [35.8 kB]
	Get:41 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-glx0 amd64 1.15-1ubuntu2 [24.8 kB]
	Get:42 http://archive.ubuntu.com/ubuntu noble/main amd64 libxcb-shm0 amd64 1.15-1ubuntu2 [5756 B]
	Get:43 http://archive.ubuntu.com/ubuntu noble/main amd64 libxxf86vm1 amd64 1:1.1.4-1build4 [9282 B]
	Get:44 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 libglx-mesa0 amd64 25.0.7-0ubuntu0.24.04.2 [141 kB]
	Get:45 http://archive.ubuntu.com/ubuntu noble-updates/main amd64 python3-setuptools all 68.1.2-2ubuntu1.2 [397 kB]
	Get:46 http://archive.ubuntu.com/ubuntu noble/universe amd64 python3-wheel all 0.42.0-2 [53.1 kB]
	Get:47 http://archive.ubuntu.com/ubuntu noble-updates/universe amd64 python3-pip all 24.0+dfsg-1ubuntu1.3 [1320 kB]
	Get:48 http://archive.ubuntu.com/ubuntu noble/main amd64 libglvnd0 amd64 1.7.0-1build1 [69.6 kB]
	Get:49 http://archive.ubuntu.com/ubuntu noble/main amd64 libglx0 amd64 1.7.0-1build1 [38.6 kB]
	Get:50 http://archive.ubuntu.com/ubuntu noble/main amd64 libgl1 amd64 1.7.0-1build1 [102 kB]
	Get:51 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 libpython3.13-dev amd64 3.13.11-1+noble1 [5410 kB]
	Get:52 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 python3.13 amd64 3.13.11-1+noble1 [2296 kB]
	Get:53 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 python3.13-dev amd64 3.13.11-1+noble1 [498 kB]
	Get:54 https://ppa.launchpadcontent.net/deadsnakes/ppa/ubuntu noble/main amd64 python3.13-venv amd64 3.13.11-1+noble1 [1698 kB]
	debconf: delaying package configuration, since apt-utils is not installed
	Fetched 65.8 MB in 28s (2332 kB/s)
	Selecting previously unselected package libbsd0:amd64.
	(Reading database ...(Reading database ... 5%
(Reading database ... 10%
(Reading database ... 15%
(Reading database ... 20%
(Reading database ... 25%
(Reading database ... 30%(Reading database ... 35%
(Reading database ... 40%
(Reading database ... 45%
(Reading database ... 50%
(Reading database ... 55%
(Reading database ... 60%
(Reading database ... 65%(Reading database ... 70%(Reading database ... 75%(Reading database ... 80%(Reading database ... 85%(Reading database ... 90%(Reading database ... 95%(Reading database ... 100%
(Reading database ... 20429 files and directories currently installed.)
	Preparing to unpack .../00-libbsd0_0.12.1-1build1.1_amd64.deb ...
	Unpacking libbsd0:amd64 (0.12.1-1build1.1) ...
	Selecting previously unselected package libdrm-common.
	Preparing to unpack .../01-libdrm-common_2.4.122-1~ubuntu0.24.04.2_all.deb ...
	Unpacking libdrm-common (2.4.122-1~ubuntu0.24.04.2) ...
	Selecting previously unselected package libdrm2:amd64.
	Preparing to unpack .../02-libdrm2_2.4.122-1~ubuntu0.24.04.2_amd64.deb ...
	Unpacking libdrm2:amd64 (2.4.122-1~ubuntu0.24.04.2) ...
	Selecting previously unselected package libedit2:amd64.
	Preparing to unpack .../03-libedit2_3.1-20230828-1build1_amd64.deb ...
	Unpacking libedit2:amd64 (3.1-20230828-1build1) ...
	Selecting previously unselected package libsensors-config.
	Preparing to unpack .../04-libsensors-config_1%3a3.6.0-9build1_all.deb ...
	Unpacking libsensors-config (1:3.6.0-9build1) ...
	Selecting previously unselected package libsensors5:amd64.
	Preparing to unpack .../05-libsensors5_1%3a3.6.0-9build1_amd64.deb ...
	Unpacking libsensors5:amd64 (1:3.6.0-9build1) ...
	Selecting previously unselected package libxau6:amd64.
	Preparing to unpack .../06-libxau6_1%3a1.0.9-1build6_amd64.deb ...
	Unpacking libxau6:amd64 (1:1.0.9-1build6) ...
	Selecting previously unselected package libxdmcp6:amd64.
	Preparing to unpack .../07-libxdmcp6_1%3a1.1.3-0ubuntu6_amd64.deb ...
	Unpacking libxdmcp6:amd64 (1:1.1.3-0ubuntu6) ...
	Selecting previously unselected package libxcb1:amd64.
	Preparing to unpack .../08-libxcb1_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb1:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libx11-data.
	Preparing to unpack .../09-libx11-data_2%3a1.8.7-1build1_all.deb ...
	Unpacking libx11-data (2:1.8.7-1build1) ...
	Selecting previously unselected package libx11-6:amd64.
	Preparing to unpack .../10-libx11-6_2%3a1.8.7-1build1_amd64.deb ...
	Unpacking libx11-6:amd64 (2:1.8.7-1build1) ...
	Selecting previously unselected package libxext6:amd64.
	Preparing to unpack .../11-libxext6_2%3a1.3.4-1build2_amd64.deb ...
	Unpacking libxext6:amd64 (2:1.3.4-1build2) ...
	Selecting previously unselected package wget.
	Preparing to unpack .../12-wget_1.21.4-1ubuntu4.1_amd64.deb ...
	Unpacking wget (1.21.4-1ubuntu4.1) ...
	Selecting previously unselected package libcurl4t64:amd64.
	Preparing to unpack .../13-libcurl4t64_8.5.0-2ubuntu10.6_amd64.deb ...
	Unpacking libcurl4t64:amd64 (8.5.0-2ubuntu10.6) ...
	Selecting previously unselected package curl.
	Preparing to unpack .../14-curl_8.5.0-2ubuntu10.6_amd64.deb ...
	Unpacking curl (8.5.0-2ubuntu10.6) ...
	Selecting previously unselected package liberror-perl.
	Preparing to unpack .../15-liberror-perl_0.17029-2_all.deb ...
	Unpacking liberror-perl (0.17029-2) ...
	Selecting previously unselected package git-man.
	Preparing to unpack .../16-git-man_1%3a2.43.0-1ubuntu7.3_all.deb ...
	Unpacking git-man (1:2.43.0-1ubuntu7.3) ...
	Selecting previously unselected package git.
	Preparing to unpack .../17-git_1%3a2.43.0-1ubuntu7.3_amd64.deb ...
	Unpacking git (1:2.43.0-1ubuntu7.3) ...
	Selecting previously unselected package libonig5:amd64.
	Preparing to unpack .../18-libonig5_6.9.9-1build1_amd64.deb ...
	Unpacking libonig5:amd64 (6.9.9-1build1) ...
	Selecting previously unselected package libjq1:amd64.
	Preparing to unpack .../19-libjq1_1.7.1-3ubuntu0.24.04.1_amd64.deb ...
	Unpacking libjq1:amd64 (1.7.1-3ubuntu0.24.04.1) ...
	Selecting previously unselected package jq.
	Preparing to unpack .../20-jq_1.7.1-3ubuntu0.24.04.1_amd64.deb ...
	Unpacking jq (1.7.1-3ubuntu0.24.04.1) ...
	Selecting previously unselected package libdrm-amdgpu1:amd64.
	Preparing to unpack .../21-libdrm-amdgpu1_2.4.122-1~ubuntu0.24.04.2_amd64.deb ...
	Unpacking libdrm-amdgpu1:amd64 (2.4.122-1~ubuntu0.24.04.2) ...
	Selecting previously unselected package libpciaccess0:amd64.
	Preparing to unpack .../22-libpciaccess0_0.17-3ubuntu0.24.04.2_amd64.deb ...
	Unpacking libpciaccess0:amd64 (0.17-3ubuntu0.24.04.2) ...
	Selecting previously unselected package libdrm-intel1:amd64.
	Preparing to unpack .../23-libdrm-intel1_2.4.122-1~ubuntu0.24.04.2_amd64.deb ...
	Unpacking libdrm-intel1:amd64 (2.4.122-1~ubuntu0.24.04.2) ...
	Selecting previously unselected package libexpat1-dev:amd64.
	Preparing to unpack .../24-libexpat1-dev_2.6.1-2ubuntu0.3_amd64.deb ...
	Unpacking libexpat1-dev:amd64 (2.6.1-2ubuntu0.3) ...
	Selecting previously unselected package libwayland-server0:amd64.
	Preparing to unpack .../25-libwayland-server0_1.22.0-2.1build1_amd64.deb ...
	Unpacking libwayland-server0:amd64 (1.22.0-2.1build1) ...
	Selecting previously unselected package libllvm20:amd64.
	Preparing to unpack .../26-libllvm20_1%3a20.1.2-0ubuntu1~24.04.2_amd64.deb ...
	Unpacking libllvm20:amd64 (1:20.1.2-0ubuntu1~24.04.2) ...
	Selecting previously unselected package libx11-xcb1:amd64.
	Preparing to unpack .../27-libx11-xcb1_2%3a1.8.7-1build1_amd64.deb ...
	Unpacking libx11-xcb1:amd64 (2:1.8.7-1build1) ...
	Selecting previously unselected package libxcb-dri3-0:amd64.
	Preparing to unpack .../28-libxcb-dri3-0_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-dri3-0:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxcb-present0:amd64.
	Preparing to unpack .../29-libxcb-present0_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-present0:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxcb-randr0:amd64.
	Preparing to unpack .../30-libxcb-randr0_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-randr0:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxcb-sync1:amd64.
	Preparing to unpack .../31-libxcb-sync1_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-sync1:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxcb-xfixes0:amd64.
	Preparing to unpack .../32-libxcb-xfixes0_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-xfixes0:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxshmfence1:amd64.
	Preparing to unpack .../33-libxshmfence1_1.3-1build5_amd64.deb ...
	Unpacking libxshmfence1:amd64 (1.3-1build5) ...
	Selecting previously unselected package mesa-libgallium:amd64.
	Preparing to unpack .../34-mesa-libgallium_25.0.7-0ubuntu0.24.04.2_amd64.deb ...
	Unpacking mesa-libgallium:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Selecting previously unselected package libgbm1:amd64.
	Preparing to unpack .../35-libgbm1_25.0.7-0ubuntu0.24.04.2_amd64.deb ...
	Unpacking libgbm1:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Selecting previously unselected package libvulkan1:amd64.
	Preparing to unpack .../36-libvulkan1_1.3.275.0-1build1_amd64.deb ...
	Unpacking libvulkan1:amd64 (1.3.275.0-1build1) ...
	Selecting previously unselected package libgl1-mesa-dri:amd64.
	Preparing to unpack .../37-libgl1-mesa-dri_25.0.7-0ubuntu0.24.04.2_amd64.deb ...
	Unpacking libgl1-mesa-dri:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Selecting previously unselected package libxcb-glx0:amd64.
	Preparing to unpack .../38-libxcb-glx0_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-glx0:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxcb-shm0:amd64.
	Preparing to unpack .../39-libxcb-shm0_1.15-1ubuntu2_amd64.deb ...
	Unpacking libxcb-shm0:amd64 (1.15-1ubuntu2) ...
	Selecting previously unselected package libxxf86vm1:amd64.
	Preparing to unpack .../40-libxxf86vm1_1%3a1.1.4-1build4_amd64.deb ...
	Unpacking libxxf86vm1:amd64 (1:1.1.4-1build4) ...
	Selecting previously unselected package libglx-mesa0:amd64.
	Preparing to unpack .../41-libglx-mesa0_25.0.7-0ubuntu0.24.04.2_amd64.deb ...
	Unpacking libglx-mesa0:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Selecting previously unselected package libpython3.13-stdlib:amd64.
	Preparing to unpack .../42-libpython3.13-stdlib_3.13.11-1+noble1_amd64.deb ...
	Unpacking libpython3.13-stdlib:amd64 (3.13.11-1+noble1) ...
	Selecting previously unselected package libpython3.13:amd64.
	Preparing to unpack .../43-libpython3.13_3.13.11-1+noble1_amd64.deb ...
	Unpacking libpython3.13:amd64 (3.13.11-1+noble1) ...
	Selecting previously unselected package libpython3.13-dev:amd64.
	Preparing to unpack .../44-libpython3.13-dev_3.13.11-1+noble1_amd64.deb ...
	Unpacking libpython3.13-dev:amd64 (3.13.11-1+noble1) ...
	Selecting previously unselected package python3-setuptools.
	Preparing to unpack .../45-python3-setuptools_68.1.2-2ubuntu1.2_all.deb ...
	Unpacking python3-setuptools (68.1.2-2ubuntu1.2) ...
	Selecting previously unselected package python3-wheel.
	Preparing to unpack .../46-python3-wheel_0.42.0-2_all.deb ...
	Unpacking python3-wheel (0.42.0-2) ...
	Selecting previously unselected package python3-pip.
	Preparing to unpack .../47-python3-pip_24.0+dfsg-1ubuntu1.3_all.deb ...
	Unpacking python3-pip (24.0+dfsg-1ubuntu1.3) ...
	Selecting previously unselected package python3.13.
	Preparing to unpack .../48-python3.13_3.13.11-1+noble1_amd64.deb ...
	Unpacking python3.13 (3.13.11-1+noble1) ...
	Selecting previously unselected package python3.13-dev.
	Preparing to unpack .../49-python3.13-dev_3.13.11-1+noble1_amd64.deb ...
	Unpacking python3.13-dev (3.13.11-1+noble1) ...
	Selecting previously unselected package python3.13-venv.
	Preparing to unpack .../50-python3.13-venv_3.13.11-1+noble1_amd64.deb ...
	Unpacking python3.13-venv (3.13.11-1+noble1) ...
	Selecting previously unselected package libglvnd0:amd64.
	Preparing to unpack .../51-libglvnd0_1.7.0-1build1_amd64.deb ...
	Unpacking libglvnd0:amd64 (1.7.0-1build1) ...
	Selecting previously unselected package libglx0:amd64.
	Preparing to unpack .../52-libglx0_1.7.0-1build1_amd64.deb ...
	Unpacking libglx0:amd64 (1.7.0-1build1) ...
	Selecting previously unselected package libgl1:amd64.
	Preparing to unpack .../53-libgl1_1.7.0-1build1_amd64.deb ...
	Unpacking libgl1:amd64 (1.7.0-1build1) ...
	Setting up libwayland-server0:amd64 (1.22.0-2.1build1) ...
	Setting up libpciaccess0:amd64 (0.17-3ubuntu0.24.04.2) ...
	Setting up libxau6:amd64 (1:1.0.9-1build6) ...
	Setting up python3-setuptools (68.1.2-2ubuntu1.2) ...
	Setting up wget (1.21.4-1ubuntu4.1) ...
	Setting up libcurl4t64:amd64 (8.5.0-2ubuntu10.6) ...
	Setting up libglvnd0:amd64 (1.7.0-1build1) ...
	Setting up libsensors-config (1:3.6.0-9build1) ...
	Setting up python3-wheel (0.42.0-2) ...
	Setting up liberror-perl (0.17029-2) ...
	Setting up libexpat1-dev:amd64 (2.6.1-2ubuntu0.3) ...
	Setting up libx11-data (2:1.8.7-1build1) ...
	Setting up libsensors5:amd64 (1:3.6.0-9build1) ...
	Setting up python3-pip (24.0+dfsg-1ubuntu1.3) ...
	Setting up libvulkan1:amd64 (1.3.275.0-1build1) ...
	Setting up libxshmfence1:amd64 (1.3-1build5) ...
	Setting up git-man (1:2.43.0-1ubuntu7.3) ...
	Setting up curl (8.5.0-2ubuntu10.6) ...
	Setting up libbsd0:amd64 (0.12.1-1build1.1) ...
	Setting up libdrm-common (2.4.122-1~ubuntu0.24.04.2) ...
	Setting up libpython3.13-stdlib:amd64 (3.13.11-1+noble1) ...
	Setting up libonig5:amd64 (6.9.9-1build1) ...
	Setting up libpython3.13:amd64 (3.13.11-1+noble1) ...
	Setting up libxdmcp6:amd64 (1:1.1.3-0ubuntu6) ...
	Setting up libxcb1:amd64 (1.15-1ubuntu2) ...
	Setting up libxcb-xfixes0:amd64 (1.15-1ubuntu2) ...
	Setting up python3.13 (3.13.11-1+noble1) ...
	Setting up libjq1:amd64 (1.7.1-3ubuntu0.24.04.1) ...
	Setting up libxcb-glx0:amd64 (1.15-1ubuntu2) ...
	Setting up libedit2:amd64 (3.1-20230828-1build1) ...
	Setting up libxcb-shm0:amd64 (1.15-1ubuntu2) ...
	Setting up python3.13-venv (3.13.11-1+noble1) ...
	Setting up libxcb-present0:amd64 (1.15-1ubuntu2) ...
	Setting up libxcb-sync1:amd64 (1.15-1ubuntu2) ...
	Setting up libpython3.13-dev:amd64 (3.13.11-1+noble1) ...
	Setting up libllvm20:amd64 (1:20.1.2-0ubuntu1~24.04.2) ...
	Setting up git (1:2.43.0-1ubuntu7.3) ...
	Setting up libdrm2:amd64 (2.4.122-1~ubuntu0.24.04.2) ...
	Setting up libxcb-randr0:amd64 (1.15-1ubuntu2) ...
	Setting up jq (1.7.1-3ubuntu0.24.04.1) ...
	Setting up libx11-6:amd64 (2:1.8.7-1build1) ...
	Setting up libdrm-amdgpu1:amd64 (2.4.122-1~ubuntu0.24.04.2) ...
	Setting up libxcb-dri3-0:amd64 (1.15-1ubuntu2) ...
	Setting up libx11-xcb1:amd64 (2:1.8.7-1build1) ...
	Setting up python3.13-dev (3.13.11-1+noble1) ...
	Setting up libdrm-intel1:amd64 (2.4.122-1~ubuntu0.24.04.2) ...
	Setting up libxext6:amd64 (2:1.3.4-1build2) ...
	Setting up libxxf86vm1:amd64 (1:1.1.4-1build4) ...
	Setting up mesa-libgallium:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Setting up libgbm1:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Setting up libgl1-mesa-dri:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Setting up libglx-mesa0:amd64 (25.0.7-0ubuntu0.24.04.2) ...
	Setting up libglx0:amd64 (1.7.0-1build1) ...
	Setting up libgl1:amd64 (1.7.0-1build1) ...
	Processing triggers for libc-bin (2.39-0ubuntu8.5) ...
	update-alternatives: using /usr/bin/python3.13 to provide /usr/bin/python (python) in auto mode
	update-alternatives: using /usr/bin/python3.13 to provide /usr/bin/python3 (python3) in auto mode
[ 3/18] RUN python --version && pip --version
	Python 3.13.11
	pip 24.0 from /usr/lib/python3/dist-packages/pip (python 3.13)
[ 4/18] WORKDIR /home/workspace
[ 5/18] RUN echo "=== Cloning ComfyUI ===" &&     git clone --depth 1 https://github.com/comfyanonymous/ComfyUI.git /home/workspace/ComfyUI &&     echo "✓ ComfyUI cloned successfully"
	=== Cloning ComfyUI ===
	Cloning into '/home/workspace/ComfyUI'...
	✓ ComfyUI cloned successfully
[ 6/18] WORKDIR /home/workspace/ComfyUI
[ 7/18] RUN echo "=== Installing ComfyUI dependencies (excluding PyTorch) ===" &&     grep -v "^torch" requirements.txt | grep -v "^torchvision" | grep -v "^torchaudio" > requirements_no_torch.txt &&     python -m pip install --no-cache-dir -r requirements_no_torch.txt &&     rm requirements_no_torch.txt &&     echo "=== Installing PyTorch nightly with CUDA 13.0 ===" &&     python -m pip install --no-cache-dir --pre torch torchvision torchaudio         --index-url https://download.pytorch.org/whl/nightly/cu130 &&     echo "✓ PyTorch installed with CUDA 13.0 support"
	=== Installing ComfyUI dependencies (excluding PyTorch) ===
	Collecting comfyui-frontend-package==1.36.14 (from -r requirements_no_torch.txt (line 1))
	Downloading comfyui_frontend_package-1.36.14-py3-none-any.whl.metadata (118 bytes)
	Collecting comfyui-workflow-templates==0.8.11 (from -r requirements_no_torch.txt (line 2))
	Downloading comfyui_workflow_templates-0.8.11-py3-none-any.whl.metadata (18 kB)
	Collecting comfyui-embedded-docs==0.4.0 (from -r requirements_no_torch.txt (line 3))
	Downloading comfyui_embedded_docs-0.4.0-py3-none-any.whl.metadata (2.9 kB)
	Collecting numpy>=1.25.0 (from -r requirements_no_torch.txt (line 4))
	Downloading numpy-2.4.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (6.6 kB)
	Collecting einops (from -r requirements_no_torch.txt (line 5))
	Downloading einops-0.8.1-py3-none-any.whl.metadata (13 kB)
	Collecting transformers>=4.50.3 (from -r requirements_no_torch.txt (line 6))
	Downloading transformers-4.57.6-py3-none-any.whl.metadata (43 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 44.0/44.0 kB 620.6 kB/s eta 0:00:00
	Collecting tokenizers>=0.13.3 (from -r requirements_no_torch.txt (line 7))
	Downloading tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (7.3 kB)
	Collecting sentencepiece (from -r requirements_no_torch.txt (line 8))
	Downloading sentencepiece-0.2.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (10 kB)
	Collecting safetensors>=0.4.2 (from -r requirements_no_torch.txt (line 9))
	Downloading safetensors-0.7.0-cp38-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (4.1 kB)
	Collecting aiohttp>=3.11.8 (from -r requirements_no_torch.txt (line 10))
	Downloading aiohttp-3.13.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (8.1 kB)
	Collecting yarl>=1.18.0 (from -r requirements_no_torch.txt (line 11))
	Downloading yarl-1.22.0-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (75 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 75.1/75.1 kB 2.8 MB/s eta 0:00:00
	Collecting pyyaml (from -r requirements_no_torch.txt (line 12))
	Downloading pyyaml-6.0.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (2.4 kB)
	Collecting Pillow (from -r requirements_no_torch.txt (line 13))
	Downloading pillow-12.1.0-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (8.8 kB)
	Collecting scipy (from -r requirements_no_torch.txt (line 14))
	Downloading scipy-1.17.0-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (62 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 62.1/62.1 kB 15.5 MB/s eta 0:00:00
	Collecting tqdm (from -r requirements_no_torch.txt (line 15))
	Downloading tqdm-4.67.1-py3-none-any.whl.metadata (57 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 57.7/57.7 kB 3.1 MB/s eta 0:00:00
	Collecting psutil (from -r requirements_no_torch.txt (line 16))
	Downloading psutil-7.2.1-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl.metadata (22 kB)
	Collecting alembic (from -r requirements_no_torch.txt (line 17))
	Downloading alembic-1.18.1-py3-none-any.whl.metadata (7.2 kB)
	Collecting SQLAlchemy (from -r requirements_no_torch.txt (line 18))
	Downloading sqlalchemy-2.0.45-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (9.5 kB)
	Collecting av>=14.2.0 (from -r requirements_no_torch.txt (line 19))
	Downloading av-16.1.0-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (4.6 kB)
	Collecting comfy-kitchen>=0.2.6 (from -r requirements_no_torch.txt (line 20))
	Downloading comfy_kitchen-0.2.7-cp312-abi3-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (7.2 kB)
	Collecting kornia>=0.7.1 (from -r requirements_no_torch.txt (line 23))
	Downloading kornia-0.8.2-py2.py3-none-any.whl.metadata (18 kB)
	Collecting spandrel (from -r requirements_no_torch.txt (line 24))
	Downloading spandrel-0.4.1-py3-none-any.whl.metadata (15 kB)
	Collecting pydantic~=2.0 (from -r requirements_no_torch.txt (line 25))
	Downloading pydantic-2.12.5-py3-none-any.whl.metadata (90 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 90.6/90.6 kB 2.1 MB/s eta 0:00:00
	Collecting pydantic-settings~=2.0 (from -r requirements_no_torch.txt (line 26))
	Downloading pydantic_settings-2.12.0-py3-none-any.whl.metadata (3.4 kB)
	Collecting comfyui-workflow-templates-core==0.3.97 (from comfyui-workflow-templates==0.8.11->-r requirements_no_torch.txt (line 2))
	Downloading comfyui_workflow_templates_core-0.3.97-py3-none-any.whl.metadata (259 bytes)
	Collecting comfyui-workflow-templates-media-api==0.3.41 (from comfyui-workflow-templates==0.8.11->-r requirements_no_torch.txt (line 2))
	Downloading comfyui_workflow_templates_media_api-0.3.41-py3-none-any.whl.metadata (290 bytes)
	Collecting comfyui-workflow-templates-media-video==0.3.38 (from comfyui-workflow-templates==0.8.11->-r requirements_no_torch.txt (line 2))
	Downloading comfyui_workflow_templates_media_video-0.3.38-py3-none-any.whl.metadata (282 bytes)
	Collecting comfyui-workflow-templates-media-image==0.3.63 (from comfyui-workflow-templates==0.8.11->-r requirements_no_torch.txt (line 2))
	Downloading comfyui_workflow_templates_media_image-0.3.63-py3-none-any.whl.metadata (282 bytes)
	Collecting comfyui-workflow-templates-media-other==0.3.84 (from comfyui-workflow-templates==0.8.11->-r requirements_no_torch.txt (line 2))
	Downloading comfyui_workflow_templates_media_other-0.3.84-py3-none-any.whl.metadata (305 bytes)
	Collecting filelock (from transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading filelock-3.20.3-py3-none-any.whl.metadata (2.1 kB)
	Collecting huggingface-hub<1.0,>=0.34.0 (from transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading huggingface_hub-0.36.0-py3-none-any.whl.metadata (14 kB)
	Collecting packaging>=20.0 (from transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading packaging-25.0-py3-none-any.whl.metadata (3.3 kB)
	Collecting regex!=2019.12.17 (from transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading regex-2026.1.15-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (40 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 40.5/40.5 kB 3.0 MB/s eta 0:00:00
	Collecting requests (from transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading requests-2.32.5-py3-none-any.whl.metadata (4.9 kB)
	Collecting aiohappyeyeballs>=2.5.0 (from aiohttp>=3.11.8->-r requirements_no_torch.txt (line 10))
	Downloading aiohappyeyeballs-2.6.1-py3-none-any.whl.metadata (5.9 kB)
	Collecting aiosignal>=1.4.0 (from aiohttp>=3.11.8->-r requirements_no_torch.txt (line 10))
	Downloading aiosignal-1.4.0-py3-none-any.whl.metadata (3.7 kB)
	Collecting attrs>=17.3.0 (from aiohttp>=3.11.8->-r requirements_no_torch.txt (line 10))
	Downloading attrs-25.4.0-py3-none-any.whl.metadata (10 kB)
	Collecting frozenlist>=1.1.1 (from aiohttp>=3.11.8->-r requirements_no_torch.txt (line 10))
	Downloading frozenlist-1.8.0-cp313-cp313-manylinux1_x86_64.manylinux_2_28_x86_64.manylinux_2_5_x86_64.whl.metadata (20 kB)
	Collecting multidict<7.0,>=4.5 (from aiohttp>=3.11.8->-r requirements_no_torch.txt (line 10))
	Downloading multidict-6.7.0-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (5.3 kB)
	Collecting propcache>=0.2.0 (from aiohttp>=3.11.8->-r requirements_no_torch.txt (line 10))
	Downloading propcache-0.4.1-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (13 kB)
	Collecting idna>=2.0 (from yarl>=1.18.0->-r requirements_no_torch.txt (line 11))
	Downloading idna-3.11-py3-none-any.whl.metadata (8.4 kB)
	Collecting Mako (from alembic->-r requirements_no_torch.txt (line 17))
	Downloading mako-1.3.10-py3-none-any.whl.metadata (2.9 kB)
	Collecting typing-extensions>=4.12 (from alembic->-r requirements_no_torch.txt (line 17))
	Downloading typing_extensions-4.15.0-py3-none-any.whl.metadata (3.3 kB)
	Collecting greenlet>=1 (from SQLAlchemy->-r requirements_no_torch.txt (line 18))
	Downloading greenlet-3.3.0-cp313-cp313-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (4.1 kB)
	Collecting kornia_rs>=0.1.9 (from kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading kornia_rs-0.1.10-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (12 kB)
	Collecting torch>=2.0.0 (from kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading torch-2.9.1-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (30 kB)
	Collecting torchvision (from spandrel->-r requirements_no_torch.txt (line 24))
	Downloading torchvision-0.24.1-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (5.9 kB)
	Collecting annotated-types>=0.6.0 (from pydantic~=2.0->-r requirements_no_torch.txt (line 25))
	Downloading annotated_types-0.7.0-py3-none-any.whl.metadata (15 kB)
	Collecting pydantic-core==2.41.5 (from pydantic~=2.0->-r requirements_no_torch.txt (line 25))
	Downloading pydantic_core-2.41.5-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (7.3 kB)
	Collecting typing-inspection>=0.4.2 (from pydantic~=2.0->-r requirements_no_torch.txt (line 25))
	Downloading typing_inspection-0.4.2-py3-none-any.whl.metadata (2.6 kB)
	Collecting python-dotenv>=0.21.0 (from pydantic-settings~=2.0->-r requirements_no_torch.txt (line 26))
	Downloading python_dotenv-1.2.1-py3-none-any.whl.metadata (25 kB)
	Collecting fsspec>=2023.5.0 (from huggingface-hub<1.0,>=0.34.0->transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading fsspec-2026.1.0-py3-none-any.whl.metadata (10 kB)
	Collecting hf-xet<2.0.0,>=1.1.3 (from huggingface-hub<1.0,>=0.34.0->transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading hf_xet-1.2.0-cp37-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl.metadata (4.9 kB)
	Requirement already satisfied: setuptools in /usr/lib/python3/dist-packages (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23)) (68.1.2)
	Collecting sympy>=1.13.3 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading sympy-1.14.0-py3-none-any.whl.metadata (12 kB)
	Collecting networkx>=2.5.1 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading networkx-3.6.1-py3-none-any.whl.metadata (6.8 kB)
	Collecting jinja2 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading jinja2-3.1.6-py3-none-any.whl.metadata (2.9 kB)
	Collecting nvidia-cuda-nvrtc-cu12==12.8.93 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-cuda-runtime-cu12==12.8.90 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-cuda-cupti-cu12==12.8.90 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-cudnn-cu12==9.10.2.21 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl.metadata (1.8 kB)
	Collecting nvidia-cublas-cu12==12.8.4.1 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-cufft-cu12==11.3.3.83 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-curand-cu12==10.3.9.90 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-cusolver-cu12==11.7.3.90 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl.metadata (1.8 kB)
	Collecting nvidia-cusparse-cu12==12.5.8.93 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.8 kB)
	Collecting nvidia-cusparselt-cu12==0.7.1 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cusparselt_cu12-0.7.1-py3-none-manylinux2014_x86_64.whl.metadata (7.0 kB)
	Collecting nvidia-nccl-cu12==2.27.5 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_nccl_cu12-2.27.5-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (2.0 kB)
	Collecting nvidia-nvshmem-cu12==3.3.20 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_nvshmem_cu12-3.3.20-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (2.1 kB)
	Collecting nvidia-nvtx-cu12==12.8.90 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.8 kB)
	Collecting nvidia-nvjitlink-cu12==12.8.93 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl.metadata (1.7 kB)
	Collecting nvidia-cufile-cu12==1.13.1.3 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl.metadata (1.7 kB)
	Collecting triton==3.5.1 (from torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading triton-3.5.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (1.7 kB)
	Collecting MarkupSafe>=0.9.2 (from Mako->alembic->-r requirements_no_torch.txt (line 17))
	Downloading markupsafe-3.0.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (2.7 kB)
	Collecting charset_normalizer<4,>=2 (from requests->transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading charset_normalizer-3.4.4-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl.metadata (37 kB)
	Collecting urllib3<3,>=1.21.1 (from requests->transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading urllib3-2.6.3-py3-none-any.whl.metadata (6.9 kB)
	Collecting certifi>=2017.4.17 (from requests->transformers>=4.50.3->-r requirements_no_torch.txt (line 6))
	Downloading certifi-2026.1.4-py3-none-any.whl.metadata (2.5 kB)
	Collecting mpmath<1.4,>=1.1.0 (from sympy>=1.13.3->torch>=2.0.0->kornia>=0.7.1->-r requirements_no_torch.txt (line 23))
	Downloading mpmath-1.3.0-py3-none-any.whl.metadata (8.6 kB)
	Downloading comfyui_frontend_package-1.36.14-py3-none-any.whl (19.4 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 19.4/19.4 MB 6.0 MB/s eta 0:00:00
	Downloading comfyui_workflow_templates-0.8.11-py3-none-any.whl (8.8 kB)
	Downloading comfyui_embedded_docs-0.4.0-py3-none-any.whl (9.6 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 9.6/9.6 MB 7.8 MB/s eta 0:00:00
	Downloading comfyui_workflow_templates_core-0.3.97-py3-none-any.whl (34 kB)
	Downloading comfyui_workflow_templates_media_api-0.3.41-py3-none-any.whl (70.6 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 70.6/70.6 MB 7.8 MB/s eta 0:00:00
	Downloading comfyui_workflow_templates_media_image-0.3.63-py3-none-any.whl (14.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 14.7/14.7 MB 6.9 MB/s eta 0:00:00
	Downloading comfyui_workflow_templates_media_other-0.3.84-py3-none-any.whl (17.8 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 17.8/17.8 MB 6.0 MB/s eta 0:00:00
	Downloading comfyui_workflow_templates_media_video-0.3.38-py3-none-any.whl (54.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 54.7/54.7 MB 7.0 MB/s eta 0:00:00
	Downloading numpy-2.4.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl (16.4 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 16.4/16.4 MB 6.3 MB/s eta 0:00:00
	Downloading einops-0.8.1-py3-none-any.whl (64 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 64.4/64.4 kB 2.3 MB/s eta 0:00:00
	Downloading transformers-4.57.6-py3-none-any.whl (12.0 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 12.0/12.0 MB 4.5 MB/s eta 0:00:00
	Downloading tokenizers-0.22.2-cp39-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.3/3.3 MB 3.8 MB/s eta 0:00:00
	Downloading sentencepiece-0.2.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl (1.4 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.4/1.4 MB 6.4 MB/s eta 0:00:00
	Downloading safetensors-0.7.0-cp38-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (507 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 507.2/507.2 kB 4.8 MB/s eta 0:00:00
	Downloading aiohttp-3.13.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (1.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.7/1.7 MB 5.4 MB/s eta 0:00:00
	Downloading yarl-1.22.0-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (377 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 377.1/377.1 kB 5.0 MB/s eta 0:00:00
	Downloading pyyaml-6.0.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (801 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 801.6/801.6 kB 4.7 MB/s eta 0:00:00
	Downloading pillow-12.1.0-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl (7.0 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 7.0/7.0 MB 5.0 MB/s eta 0:00:00
	Downloading scipy-1.17.0-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl (35.0 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 35.0/35.0 MB 7.6 MB/s eta 0:00:00
	Downloading tqdm-4.67.1-py3-none-any.whl (78 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 78.5/78.5 kB 9.8 MB/s eta 0:00:00
	Downloading psutil-7.2.1-cp36-abi3-manylinux2010_x86_64.manylinux_2_12_x86_64.manylinux_2_28_x86_64.whl (154 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 154.7/154.7 kB 4.5 MB/s eta 0:00:00
	Downloading alembic-1.18.1-py3-none-any.whl (260 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 261.0/261.0 kB 14.3 MB/s eta 0:00:00
	Downloading sqlalchemy-2.0.45-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (3.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.3/3.3 MB 7.0 MB/s eta 0:00:00
	Downloading av-16.1.0-cp313-cp313-manylinux_2_28_x86_64.whl (40.9 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 40.9/40.9 MB 6.1 MB/s eta 0:00:00
	Downloading comfy_kitchen-0.2.7-cp312-abi3-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl (680 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 680.6/680.6 kB 6.7 MB/s eta 0:00:00
	Downloading kornia-0.8.2-py2.py3-none-any.whl (1.1 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.1/1.1 MB 5.5 MB/s eta 0:00:00
	Downloading spandrel-0.4.1-py3-none-any.whl (305 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 305.2/305.2 kB 7.4 MB/s eta 0:00:00
	Downloading pydantic-2.12.5-py3-none-any.whl (463 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 463.6/463.6 kB 7.4 MB/s eta 0:00:00
	Downloading pydantic_core-2.41.5-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (2.1 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.1/2.1 MB 5.5 MB/s eta 0:00:00
	Downloading pydantic_settings-2.12.0-py3-none-any.whl (51 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 51.9/51.9 kB 8.0 MB/s eta 0:00:00
	Downloading aiohappyeyeballs-2.6.1-py3-none-any.whl (15 kB)
	Downloading aiosignal-1.4.0-py3-none-any.whl (7.5 kB)
	Downloading annotated_types-0.7.0-py3-none-any.whl (13 kB)
	Downloading attrs-25.4.0-py3-none-any.whl (67 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 67.6/67.6 kB 14.5 MB/s eta 0:00:00
	Downloading frozenlist-1.8.0-cp313-cp313-manylinux1_x86_64.manylinux_2_28_x86_64.manylinux_2_5_x86_64.whl (234 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 234.4/234.4 kB 11.6 MB/s eta 0:00:00
	Downloading greenlet-3.3.0-cp313-cp313-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl (612 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 612.8/612.8 kB 6.3 MB/s eta 0:00:00
	Downloading huggingface_hub-0.36.0-py3-none-any.whl (566 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 566.1/566.1 kB 5.2 MB/s eta 0:00:00
	Downloading idna-3.11-py3-none-any.whl (71 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 71.0/71.0 kB 5.5 MB/s eta 0:00:00
	Downloading kornia_rs-0.1.10-cp313-cp313-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.0 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.0/3.0 MB 4.7 MB/s eta 0:00:00
	Downloading multidict-6.7.0-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (254 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 254.9/254.9 kB 3.8 MB/s eta 0:00:00
	Downloading packaging-25.0-py3-none-any.whl (66 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 66.5/66.5 kB 8.9 MB/s eta 0:00:00
	Downloading propcache-0.4.1-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (204 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 204.4/204.4 kB 5.1 MB/s eta 0:00:00
	Downloading python_dotenv-1.2.1-py3-none-any.whl (21 kB)
	Downloading regex-2026.1.15-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (803 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 803.6/803.6 kB 3.4 MB/s eta 0:00:00
	Downloading torch-2.9.1-cp313-cp313-manylinux_2_28_x86_64.whl (899.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 899.7/899.7 MB 7.7 MB/s eta 0:00:00
	Downloading nvidia_cublas_cu12-12.8.4.1-py3-none-manylinux_2_27_x86_64.whl (594.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 594.3/594.3 MB 6.3 MB/s eta 0:00:00
	Downloading nvidia_cuda_cupti_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (10.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 10.2/10.2 MB 2.9 MB/s eta 0:00:00
	Downloading nvidia_cuda_nvrtc_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl (88.0 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 88.0/88.0 MB 9.2 MB/s eta 0:00:00
	Downloading nvidia_cuda_runtime_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (954 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 954.8/954.8 kB 7.6 MB/s eta 0:00:00
	Downloading nvidia_cudnn_cu12-9.10.2.21-py3-none-manylinux_2_27_x86_64.whl (706.8 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 706.8/706.8 MB 7.0 MB/s eta 0:00:00
	Downloading nvidia_cufft_cu12-11.3.3.83-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (193.1 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 193.1/193.1 MB 7.0 MB/s eta 0:00:00
	Downloading nvidia_cufile_cu12-1.13.1.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (1.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.2/1.2 MB 4.3 MB/s eta 0:00:00
	Downloading nvidia_curand_cu12-10.3.9.90-py3-none-manylinux_2_27_x86_64.whl (63.6 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 63.6/63.6 MB 8.0 MB/s eta 0:00:00
	Downloading nvidia_cusolver_cu12-11.7.3.90-py3-none-manylinux_2_27_x86_64.whl (267.5 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 267.5/267.5 MB 4.3 MB/s eta 0:00:00
	Downloading nvidia_cusparse_cu12-12.5.8.93-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (288.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 288.2/288.2 MB 7.5 MB/s eta 0:00:00
	Downloading nvidia_cusparselt_cu12-0.7.1-py3-none-manylinux2014_x86_64.whl (287.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 287.2/287.2 MB 6.8 MB/s eta 0:00:00
	Downloading nvidia_nccl_cu12-2.27.5-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (322.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 322.3/322.3 MB 4.8 MB/s eta 0:00:00
	Downloading nvidia_nvjitlink_cu12-12.8.93-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl (39.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 39.3/39.3 MB 3.6 MB/s eta 0:00:00
	Downloading nvidia_nvshmem_cu12-3.3.20-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (124.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 124.7/124.7 MB 7.2 MB/s eta 0:00:00
	Downloading nvidia_nvtx_cu12-12.8.90-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (89 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 90.0/90.0 kB 5.3 MB/s eta 0:00:00
	Downloading triton-3.5.1-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl (170.5 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 170.5/170.5 MB 5.3 MB/s eta 0:00:00
	Downloading typing_extensions-4.15.0-py3-none-any.whl (44 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 44.6/44.6 kB 22.7 MB/s eta 0:00:00
	Downloading typing_inspection-0.4.2-py3-none-any.whl (14 kB)
	Downloading filelock-3.20.3-py3-none-any.whl (16 kB)
	Downloading mako-1.3.10-py3-none-any.whl (78 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 78.5/78.5 kB 10.2 MB/s eta 0:00:00
	Downloading requests-2.32.5-py3-none-any.whl (64 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 64.7/64.7 kB 15.6 MB/s eta 0:00:00
	Downloading torchvision-0.24.1-cp313-cp313-manylinux_2_28_x86_64.whl (8.0 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 8.0/8.0 MB 2.7 MB/s eta 0:00:00
	Downloading certifi-2026.1.4-py3-none-any.whl (152 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 152.9/152.9 kB 7.0 MB/s eta 0:00:00
	Downloading charset_normalizer-3.4.4-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (153 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 153.1/153.1 kB 5.9 MB/s eta 0:00:00
	Downloading fsspec-2026.1.0-py3-none-any.whl (201 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 201.8/201.8 kB 7.7 MB/s eta 0:00:00
	Downloading hf_xet-1.2.0-cp37-abi3-manylinux_2_17_x86_64.manylinux2014_x86_64.whl (3.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 3.3/3.3 MB 6.3 MB/s eta 0:00:00
	Downloading markupsafe-3.0.3-cp313-cp313-manylinux2014_x86_64.manylinux_2_17_x86_64.manylinux_2_28_x86_64.whl (22 kB)
	Downloading networkx-3.6.1-py3-none-any.whl (2.1 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.1/2.1 MB 5.9 MB/s eta 0:00:00
	Downloading sympy-1.14.0-py3-none-any.whl (6.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 6.3/6.3 MB 3.2 MB/s eta 0:00:00
	Downloading urllib3-2.6.3-py3-none-any.whl (131 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 131.6/131.6 kB 14.7 MB/s eta 0:00:00
	Downloading jinja2-3.1.6-py3-none-any.whl (134 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 134.9/134.9 kB 5.7 MB/s eta 0:00:00
	Downloading mpmath-1.3.0-py3-none-any.whl (536 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 536.2/536.2 kB 9.8 MB/s eta 0:00:00
	Installing collected packages: nvidia-cusparselt-cu12, mpmath, urllib3, typing-extensions, triton, tqdm, sympy, sentencepiece, safetensors, regex, pyyaml, python-dotenv, psutil, propcache, Pillow, packaging, nvidia-nvtx-cu12, nvidia-nvshmem-cu12, nvidia-nvjitlink-cu12, nvidia-nccl-cu12, nvidia-curand-cu12, nvidia-cufile-cu12, nvidia-cuda-runtime-cu12, nvidia-cuda-nvrtc-cu12, nvidia-cuda-cupti-cu12, nvidia-cublas-cu12, numpy, networkx, multidict, MarkupSafe, kornia_rs, idna, hf-xet, greenlet, fsspec, frozenlist, filelock, einops, comfyui-workflow-templates-media-video, comfyui-workflow-templates-media-other, comfyui-workflow-templates-media-image, comfyui-workflow-templates-media-api, comfyui-workflow-templates-core, comfyui-frontend-package, comfyui-embedded-docs, comfy-kitchen, charset_normalizer, certifi, av, attrs, annotated-types, aiohappyeyeballs, yarl, typing-inspection, SQLAlchemy, scipy, requests, pydantic-core, nvidia-cusparse-cu12, nvidia-cufft-cu12, nvidia-cudnn-cu12, Mako, jinja2, comfyui-workflow-templates, aiosignal, pydantic, nvidia-cusolver-cu12, huggingface-hub, alembic, aiohttp, torch, tokenizers, pydantic-settings, transformers, torchvision, kornia, spandrel
	Successfully installed Mako-1.3.10 MarkupSafe-3.0.3 Pillow-12.1.0 SQLAlchemy-2.0.45 aiohappyeyeballs-2.6.1 aiohttp-3.13.3 aiosignal-1.4.0 alembic-1.18.1 annotated-types-0.7.0 attrs-25.4.0 av-16.1.0 certifi-2026.1.4 charset_normalizer-3.4.4 comfy-kitchen-0.2.7 comfyui-embedded-docs-0.4.0 comfyui-frontend-package-1.36.14 comfyui-workflow-templates-0.8.11 comfyui-workflow-templates-core-0.3.97 comfyui-workflow-templates-media-api-0.3.41 comfyui-workflow-templates-media-image-0.3.63 comfyui-workflow-templates-media-other-0.3.84 comfyui-workflow-templates-media-video-0.3.38 einops-0.8.1 filelock-3.20.3 frozenlist-1.8.0 fsspec-2026.1.0 greenlet-3.3.0 hf-xet-1.2.0 huggingface-hub-0.36.0 idna-3.11 jinja2-3.1.6 kornia-0.8.2 kornia_rs-0.1.10 mpmath-1.3.0 multidict-6.7.0 networkx-3.6.1 numpy-2.4.1 nvidia-cublas-cu12-12.8.4.1 nvidia-cuda-cupti-cu12-12.8.90 nvidia-cuda-nvrtc-cu12-12.8.93 nvidia-cuda-runtime-cu12-12.8.90 nvidia-cudnn-cu12-9.10.2.21 nvidia-cufft-cu12-11.3.3.83 nvidia-cufile-cu12-1.13.1.3 nvidia-curand-cu12-10.3.9.90 nvidia-cusolver-cu12-11.7.3.90 nvidia-cusparse-cu12-12.5.8.93 nvidia-cusparselt-cu12-0.7.1 nvidia-nccl-cu12-2.27.5 nvidia-nvjitlink-cu12-12.8.93 nvidia-nvshmem-cu12-3.3.20 nvidia-nvtx-cu12-12.8.90 packaging-25.0 propcache-0.4.1 psutil-7.2.1 pydantic-2.12.5 pydantic-core-2.41.5 pydantic-settings-2.12.0 python-dotenv-1.2.1 pyyaml-6.0.3 regex-2026.1.15 requests-2.32.5 safetensors-0.7.0 scipy-1.17.0 sentencepiece-0.2.1 spandrel-0.4.1 sympy-1.14.0 tokenizers-0.22.2 torch-2.9.1 torchvision-0.24.1 tqdm-4.67.1 transformers-4.57.6 triton-3.5.1 typing-extensions-4.15.0 typing-inspection-0.4.2 urllib3-2.6.3 yarl-1.22.0
	WARNING: Running pip as the 'root' user can result in broken permissions and conflicting behaviour with the system package manager. It is recommended to use a virtual environment instead: https://pip.pypa.io/warnings/venv
	=== Installing PyTorch nightly with CUDA 13.0 ===
	Looking in indexes: https://download.pytorch.org/whl/nightly/cu130
	Requirement already satisfied: torch in /usr/local/lib/python3.13/dist-packages (2.9.1)
	Requirement already satisfied: torchvision in /usr/local/lib/python3.13/dist-packages (0.24.1)
	Collecting torchaudio
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260117%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Requirement already satisfied: filelock in /usr/local/lib/python3.13/dist-packages (from torch) (3.20.3)
	Requirement already satisfied: typing-extensions>=4.10.0 in /usr/local/lib/python3.13/dist-packages (from torch) (4.15.0)
	Requirement already satisfied: setuptools in /usr/lib/python3/dist-packages (from torch) (68.1.2)
	Requirement already satisfied: sympy>=1.13.3 in /usr/local/lib/python3.13/dist-packages (from torch) (1.14.0)
	Requirement already satisfied: networkx>=2.5.1 in /usr/local/lib/python3.13/dist-packages (from torch) (3.6.1)
	Requirement already satisfied: jinja2 in /usr/local/lib/python3.13/dist-packages (from torch) (3.1.6)
	Requirement already satisfied: fsspec>=0.8.5 in /usr/local/lib/python3.13/dist-packages (from torch) (2026.1.0)
	Requirement already satisfied: nvidia-cuda-nvrtc-cu12==12.8.93 in /usr/local/lib/python3.13/dist-packages (from torch) (12.8.93)
	Requirement already satisfied: nvidia-cuda-runtime-cu12==12.8.90 in /usr/local/lib/python3.13/dist-packages (from torch) (12.8.90)
	Requirement already satisfied: nvidia-cuda-cupti-cu12==12.8.90 in /usr/local/lib/python3.13/dist-packages (from torch) (12.8.90)
	Requirement already satisfied: nvidia-cudnn-cu12==9.10.2.21 in /usr/local/lib/python3.13/dist-packages (from torch) (9.10.2.21)
	Requirement already satisfied: nvidia-cublas-cu12==12.8.4.1 in /usr/local/lib/python3.13/dist-packages (from torch) (12.8.4.1)
	Requirement already satisfied: nvidia-cufft-cu12==11.3.3.83 in /usr/local/lib/python3.13/dist-packages (from torch) (11.3.3.83)
	Requirement already satisfied: nvidia-curand-cu12==10.3.9.90 in /usr/local/lib/python3.13/dist-packages (from torch) (10.3.9.90)
	Requirement already satisfied: nvidia-cusolver-cu12==11.7.3.90 in /usr/local/lib/python3.13/dist-packages (from torch) (11.7.3.90)
	Requirement already satisfied: nvidia-cusparse-cu12==12.5.8.93 in /usr/local/lib/python3.13/dist-packages (from torch) (12.5.8.93)
	Requirement already satisfied: nvidia-cusparselt-cu12==0.7.1 in /usr/local/lib/python3.13/dist-packages (from torch) (0.7.1)
	Requirement already satisfied: nvidia-nccl-cu12==2.27.5 in /usr/local/lib/python3.13/dist-packages (from torch) (2.27.5)
	Requirement already satisfied: nvidia-nvshmem-cu12==3.3.20 in /usr/local/lib/python3.13/dist-packages (from torch) (3.3.20)
	Requirement already satisfied: nvidia-nvtx-cu12==12.8.90 in /usr/local/lib/python3.13/dist-packages (from torch) (12.8.90)
	Requirement already satisfied: nvidia-nvjitlink-cu12==12.8.93 in /usr/local/lib/python3.13/dist-packages (from torch) (12.8.93)
	Requirement already satisfied: nvidia-cufile-cu12==1.13.1.3 in /usr/local/lib/python3.13/dist-packages (from torch) (1.13.1.3)
	Requirement already satisfied: triton==3.5.1 in /usr/local/lib/python3.13/dist-packages (from torch) (3.5.1)
	Requirement already satisfied: numpy in /usr/local/lib/python3.13/dist-packages (from torchvision) (2.4.1)
	Requirement already satisfied: pillow!=8.3.*,>=5.3.0 in /usr/local/lib/python3.13/dist-packages (from torchvision) (12.1.0)
	INFO: pip is looking at multiple versions of torchaudio to determine which version is compatible with other requirements. This could take a while.
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260116%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260115%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260114%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260113%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260112%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260111%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260110%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	INFO: pip is still looking at multiple versions of torchaudio to determine which version is compatible with other requirements. This could take a while.
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260109%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260108%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.11.0.dev20260107%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20260106%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20260105%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	INFO: This is taking longer than usual. You might need to provide the dependency resolver with stricter constraints to reduce runtime. See https://pip.pypa.io/warnings/backtracking for guidance. If you want to abort this run, press Ctrl + C.
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20260104%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20260103%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20260102%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20260101%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251231%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251230%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251229%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251228%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251227%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251226%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251225%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251224%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251223%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251222%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251221%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251220%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251219%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251218%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251217%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251216%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251215%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251214%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251213%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251212%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251211%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251210%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251209%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251208%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251207%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251206%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251205%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251204%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251203%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251202%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251124%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251123%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251122%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251121%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251120%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251119%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251118%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251117%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251116%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251115%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251114%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251113%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchaudio-2.10.0.dev20251112%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (6.9 kB)
	Collecting torchvision
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchvision-0.25.0.dev20260117%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (5.4 kB)
	Collecting torch
	Downloading https://download.pytorch.org/whl/nightly/cu130/torch-2.11.0.dev20260117%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl.metadata (30 kB)
	Collecting cuda-bindings==13.0.3 (from torch)
	Downloading https://download.pytorch.org/whl/nightly/cu130/cuda_bindings-13.0.3-cp313-cp313-manylinux_2_24_x86_64.manylinux_2_28_x86_64.whl.metadata (2.3 kB)
	Collecting nvidia-cuda-nvrtc==13.0.88 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cuda-nvrtc/nvidia_cuda_nvrtc-13.0.88-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl (90.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 90.2/90.2 MB 4.9 MB/s eta 0:00:00
	Collecting nvidia-cuda-runtime~=13.0.48 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cuda-runtime/nvidia_cuda_runtime-13.0.96-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (2.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 2.2/2.2 MB 5.1 MB/s eta 0:00:00
	Collecting nvidia-cuda-cupti==13.0.85 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cuda-cupti/nvidia_cuda_cupti-13.0.85-py3-none-manylinux_2_25_x86_64.whl (10.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 10.7/10.7 MB 6.0 MB/s eta 0:00:00
	Collecting nvidia-cudnn-cu13==9.15.1.9 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cudnn-cu13/nvidia_cudnn_cu13-9.15.1.9-py3-none-manylinux_2_27_x86_64.whl (351.3 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 351.3/351.3 MB 4.3 MB/s eta 0:00:00
	Collecting nvidia-cublas==13.1.0.3 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cublas/nvidia_cublas-13.1.0.3-py3-none-manylinux_2_27_x86_64.whl (423.1 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 423.1/423.1 MB 3.7 MB/s eta 0:00:00
	Collecting nvidia-cufft==12.0.0.61 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cufft/nvidia_cufft-12.0.0.61-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (214.1 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 214.1/214.1 MB 5.2 MB/s eta 0:00:00
	Collecting nvidia-curand==10.4.0.35 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-curand/nvidia_curand-10.4.0.35-py3-none-manylinux_2_27_x86_64.whl (59.5 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 59.5/59.5 MB 5.8 MB/s eta 0:00:00
	Collecting nvidia-cusolver==12.0.4.66 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cusolver/nvidia_cusolver-12.0.4.66-py3-none-manylinux_2_27_x86_64.whl (200.9 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 200.9/200.9 MB 4.6 MB/s eta 0:00:00
	Collecting nvidia-cusparse==12.6.3.3 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cusparse/nvidia_cusparse-12.6.3.3-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (145.9 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 145.9/145.9 MB 5.4 MB/s eta 0:00:00
	Collecting nvidia-cusparselt-cu13==0.8.0 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cusparselt-cu13/nvidia_cusparselt_cu13-0.8.0-py3-none-manylinux2014_x86_64.whl (169.9 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 169.9/169.9 MB 4.7 MB/s eta 0:00:00
	Collecting nvidia-nccl-cu13==2.28.9 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-nccl-cu13/nvidia_nccl_cu13-2.28.9-py3-none-manylinux_2_18_x86_64.whl (196.5 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 196.5/196.5 MB 3.0 MB/s eta 0:00:00
	Collecting nvidia-nvshmem-cu13==3.4.5 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-nvshmem-cu13/nvidia_nvshmem_cu13-3.4.5-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (60.4 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 60.4/60.4 MB 4.5 MB/s eta 0:00:00
	Collecting nvidia-nvtx==13.0.85 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-nvtx/nvidia_nvtx-13.0.85-py3-none-manylinux1_x86_64.manylinux_2_5_x86_64.whl (148 kB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 148.0/148.0 kB 3.7 MB/s eta 0:00:00
	Collecting nvidia-nvjitlink==13.0.88 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-nvjitlink/nvidia_nvjitlink-13.0.88-py3-none-manylinux2010_x86_64.manylinux_2_12_x86_64.whl (40.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 40.7/40.7 MB 3.4 MB/s eta 0:00:00
	Collecting nvidia-cufile==1.15.1.6 (from torch)
	Downloading https://pypi.nvidia.com/nvidia-cufile/nvidia_cufile-1.15.1.6-py3-none-manylinux2014_x86_64.manylinux_2_17_x86_64.whl (1.2 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 1.2/1.2 MB 3.2 MB/s eta 0:00:00
	Collecting triton==3.6.0+git9844da95 (from torch)
	Downloading https://download.pytorch.org/whl/nightly/triton-3.6.0%2Bgit9844da95-cp313-cp313-manylinux_2_27_x86_64.manylinux_2_28_x86_64.whl.metadata (1.7 kB)
	Collecting cuda-pathfinder~=1.1 (from cuda-bindings==13.0.3->torch)
	Downloading https://download.pytorch.org/whl/nightly/cuda_pathfinder-1.2.2-py3-none-any.whl.metadata (3.2 kB)
	Requirement already satisfied: mpmath<1.4,>=1.1.0 in /usr/local/lib/python3.13/dist-packages (from sympy>=1.13.3->torch) (1.3.0)
	Requirement already satisfied: MarkupSafe>=2.0 in /usr/local/lib/python3.13/dist-packages (from jinja2->torch) (3.0.3)
	Downloading https://download.pytorch.org/whl/nightly/cu130/torchvision-0.25.0.dev20260117%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl (7.7 MB)
	━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 7.7/7.7 MB 4.7 MB/s eta 0:00:00
	Downloading https://download.pytorch.org/whl/nightly/cu130/torch-2.11.0.dev20260117%2Bcu130-cp313-cp313-manylinux_2_28_x86_64.whl (618.4 MB)
