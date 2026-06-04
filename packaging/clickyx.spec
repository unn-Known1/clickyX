Name: clickyx
Version: %{version}
Release: 1%{?dist}
Summary: Cross-platform AI companion with voice, screen context, and agent mode
License: MIT
URL: https://github.com/unn-Known1/clickyX

%description
ClickyX is a cross-platform AI companion with voice interaction,
screen context awareness, agent mode, and cursor overlay.

%install
install -Dm755 %{_builddir}/clickyx %{buildroot}%{_bindir}/clickyx
install -Dm644 %{_builddir}/clickyx.desktop %{buildroot}%{_datadir}/applications/clickyx.desktop

%files
%{_bindir}/clickyx
%{_datadir}/applications/clickyx.desktop

%changelog
* Thu Jun 04 2026 ClickyX Team <dev@clickyx.app> - 1.0.0-1
- Initial package
