#pragma once
#include <cstddef>
#include <cstdlib>
#include <string>
#include <cxxabi.h>
#include <boost/pfr/core_name.hpp>
#include "vendor/enchantum_single_header.hpp"

/** copy-paste from Boost*/
struct scoped_demangled_name {
    char const *m_p;

    explicit scoped_demangled_name(char const *name) noexcept {
        int status = 0;
        std::size_t size = 0;
        m_p = abi::__cxa_demangle(name, nullptr, &size, &status);
    }

    ~scoped_demangled_name() noexcept { std::free(const_cast<char *>(m_p)); }

    scoped_demangled_name(scoped_demangled_name const &) = delete;

    scoped_demangled_name &operator=(scoped_demangled_name const &) = delete;

    static std::string demangle(const char *name) {
        scoped_demangled_name demangled_name(name);
        char const *p = demangled_name.m_p;
        if (!p)
            p = name;
        return p;
    }
};

template<typename T>
std::string tName() {
    return scoped_demangled_name::demangle(typeid(T).name());
}

template<typename T>
std::string displayType() {
    return tName<T>();
}

template<typename T> requires std::is_enum_v<T>
std::string displayType() {
    return tName<std::underlying_type_t<T> >();
}


template<typename T> requires std::is_enum_v<T>
void enumValuesJsonObj(std::ostringstream &output) {
    output << "{";
    bool first = true;
    for (auto [value, name]: enchantum::entries_generator<T>) {
        if (!first) output << ", ";
        output << "\"" << name << "\": " << std::to_string(value);
        first = false;
    }
    output << "}\n";
}

/**
 * return a JSON representation of the memory layout of a struct so that it can be used in JS
 */
template<typename T>
[[nodiscard]]
__attribute((ownership_returns(malloc)))
char *getStructLayout(T &instance) {
    auto instanceAddr = reinterpret_cast<size_t>(&instance);
    std::ostringstream output;
    output << "{\"addr\":" << instanceAddr << ", \"size\":" << sizeof(T) << ", \"fields\": {\n";
    bool started = false;
    boost::pfr::for_each_field_with_name(
        instance, [&]<typename FieldType>(std::string_view name, const FieldType &value) {
            if (std::is_scalar_v<FieldType>) {
                const size_t offset = reinterpret_cast<size_t>(&value) - instanceAddr;
                if (started) output << ",\n";
                started = true;
                output << "\"" << name << R"(": {"offset": )" << offset << ", \"len\": "
                        << sizeof(FieldType) << R"(, "type": ")" << displayType<FieldType>() << "\"";
                if constexpr (std::is_enum_v<FieldType>) {
                    output << R"(, "enum": ")" << tName<FieldType>() << "\"";
                    output << ", \"enumValues\": ";
                    enumValuesJsonObj<FieldType>(output);
                }
                output << "}";
            }
        });
    output << "}}";
    return strdup(output.str().c_str());
}

inline ceres::ScaledLoss *scaledLossSigma(const double sigma, const ceres::LossFunction *robustLoss = nullptr) {
    if (!(sigma > 0.0) || !std::isfinite(sigma)) {
        std::cerr << "Invalid sigma for loss scaling: " << sigma << "\n";
        std::abort();
    }
    const double factor = 1.0 / (sigma * sigma);
    return new ceres::ScaledLoss(robustLoss, factor, ceres::TAKE_OWNERSHIP);
}
