import React, { useState } from 'react';
import { 
  SafeAreaView, 
  Text, 
  StyleSheet, 
  ScrollView, 
  View, 
  Image, 
  TouchableOpacity,
  TextInput,
  FlatList,
  Modal,
  Alert
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function MarketScreen({ navigation }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [showFilters, setShowFilters] = useState(false);
  const [sortBy, setSortBy] = useState('popular');
  const [cartItems, setCartItems] = useState([]);
  const [wishlist, setWishlist] = useState([]);

  // Categories
  const categories = [
    'All', 'Electronics', 'Home Appliances', 'Phones', 'Kitchen', 'Fashion'
  ];

  // Enhanced product data
  const products = [
    {
      id: 1,
      discount: '-28%',
      discount2: '-32%',
      title: 'SIG-KU55V6-S UHD 4K Smart TV',
      price: 'GHC 3,821.00',
      originalPrice: 'GHC 5,299.00',
      category: 'Electronics',
      rating: 4.5,
      reviews: 128,
      image: require('../../../assets/images/iphone.jpg'),
      seller: 'TechHub Ghana',
      location: 'Accra',
      description: '55-inch 4K Ultra HD Smart TV with HDR and built-in streaming apps',
      features: ['4K Ultra HD', 'Smart TV', 'HDR', 'Built-in Streaming Apps']
    },
    {
      id: 2,
      title: 'WP - 167A Double Door Refrigerator',
      price: 'GHC 2,383.00',
      category: 'Home Appliances',
      rating: 4.2,
      reviews: 89,
      image: require('../../../assets/images/foodecar.jpg'),
      seller: 'Home Essentials',
      location: 'Kumasi',
      description: 'Energy efficient double door refrigerator with frost-free technology',
      features: ['Energy Efficient', 'Frost-Free', 'Double Door']
    },
    {
      id: 3,
      discount: '-28%',
      discount2: '-7%',
      title: 'BGC 55401F Burner Gas Cooker',
      price: 'GHC 1,511.63',
      originalPrice: 'GHC 2,099.00',
      category: 'Kitchen',
      rating: 4.3,
      reviews: 156,
      image: require('../../../assets/images/sandwich.jpg'),
      seller: 'Kitchen World',
      location: 'Takoradi',
      description: '5-burner gas cooker with automatic ignition and safety features',
      features: ['5 Burners', 'Automatic Ignition', 'Safety Features']
    },
    {
      id: 4,
      title: 'Galaxy A16 - 128GB + 4GB RAM',
      price: 'GHC 1,861.70',
      category: 'Phones',
      rating: 4.1,
      reviews: 203,
      features: ['1000 Wattage', 'TEM WORLD ARTS', 'WATER SUPERHIGH', 'SCENARIO', 'MUSIC & MOVIE COMPANIES'],
      image: require('../../../assets/images/17pro.jpg'),
      seller: 'Mobile Zone',
      location: 'Accra',
      description: 'Latest smartphone with advanced camera and long-lasting battery'
    },
    {
      id: 5,
      discount: '-61%',
      discount2: '-63%',
      title: 'SWACSB Blender',
      subtitle: 'High capacity Multifunction Blender',
      price: 'GHC 899.00',
      originalPrice: 'GHC 2,299.00',
      category: 'Kitchen',
      rating: 4.7,
      reviews: 312,
      features: ['German technology', 'German cable', 'Laboratory media'],
      image: require('../../../assets/images/bugatti.jpg'),
      seller: 'Kitchen Pro',
      location: 'Tamale',
      description: 'Professional blender with multiple speed settings and durable blades'
    },
    {
      id: 6,
      title: 'Sports Car Model',
      price: 'GHC 12,500.00',
      category: 'Electronics',
      rating: 4.4,
      reviews: 67,
      image: require('../../../assets/images/car.gif'),
      seller: 'Toy Empire',
      location: 'Accra',
      description: 'Detailed sports car model with remote control features',
      features: ['Remote Control', 'Detailed Model', 'Sports Car']
    }
  ];

  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = product.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         product.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'All' || product.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Sort products
  const sortedProducts = [...filteredProducts].sort((a, b) => {
    switch (sortBy) {
      case 'price-low':
        return parseFloat(a.price.replace('GHC ', '').replace(',', '')) - 
               parseFloat(b.price.replace('GHC ', '').replace(',', ''));
      case 'price-high':
        return parseFloat(b.price.replace('GHC ', '').replace(',', '')) - 
               parseFloat(a.price.replace('GHC ', '').replace(',', ''));
      case 'rating':
        return b.rating - a.rating;
      default:
        return b.reviews - a.reviews; // popular
    }
  });

  const toggleWishlist = (productId) => {
    if (wishlist.includes(productId)) {
      setWishlist(wishlist.filter(id => id !== productId));
    } else {
      setWishlist([...wishlist, productId]);
    }
  };

  const addToCart = (product) => {
    setCartItems([...cartItems, product]);
    Alert.alert('Success', `${product.title} added to cart!`);
  };

  const renderStars = (rating) => {
    const stars = [];
    for (let i = 1; i <= 5; i++) {
      stars.push(
        <Ionicons
          key={i}
          name={i <= rating ? 'star' : 'star-outline'}
          size={12}
          color="#FFD700"
        />
      );
    }
    return stars;
  };

  const ProductCard = ({ product }) => (
    <TouchableOpacity 
      style={styles.productCard}
      onPress={() => navigation.navigate('ProductDetail', { product })}
    >
      {/* Discount badges */}
      {product.discount && (
        <View style={styles.discountContainer}>
          <View style={styles.discountBadge}>
            <Text style={styles.discountText}>{product.discount}</Text>
          </View>
          {product.discount2 && (
            <View style={[styles.discountBadge, styles.secondDiscount]}>
              <Text style={styles.discountText}>{product.discount2}</Text>
            </View>
          )}
        </View>
      )}

      {/* Wishlist button */}
      <TouchableOpacity 
        style={styles.wishlistButton}
        onPress={() => toggleWishlist(product.id)}
      >
        <Ionicons
          name={wishlist.includes(product.id) ? 'heart' : 'heart-outline'}
          size={20}
          color={wishlist.includes(product.id) ? '#FF4444' : '#666'}
        />
      </TouchableOpacity>
      
      {/* Product image */}
      <View style={styles.imageContainer}>
        <Image 
          source={product.image} 
          style={styles.productImage}
          resizeMode="cover"
        />
      </View>

      {/* Product info */}
      <View style={styles.productInfo}>
        <Text style={styles.productTitle}>{product.title}</Text>
        
        {product.subtitle && (
          <Text style={styles.productSubtitle}>{product.subtitle}</Text>
        )}
        
        {/* Rating */}
        <View style={styles.ratingContainer}>
          <View style={styles.starsContainer}>
            {renderStars(product.rating)}
          </View>
          <Text style={styles.ratingText}>({product.reviews})</Text>
        </View>

        {/* Seller info */}
        <Text style={styles.sellerText}>{product.seller} • {product.location}</Text>
        
        {/* Features list */}
        {product.features && (
          <View style={styles.featuresContainer}>
            {product.features.slice(0, 2).map((feature, index) => (
              <Text key={index} style={styles.featureText}>• {feature}</Text>
            ))}
          </View>
        )}
        
        {/* Price */}
        <View style={styles.priceContainer}>
          <Text style={styles.productPrice}>{product.price}</Text>
          {product.originalPrice && (
            <Text style={styles.originalPrice}>{product.originalPrice}</Text>
          )}
        </View>

        {/* Add to cart button */}
        <TouchableOpacity 
          style={styles.addToCartButton}
          onPress={() => addToCart(product)}
        >
          <Text style={styles.addToCartText}>Add to Cart</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container}>
      {/* Header with search and cart */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          {/* Search Bar */}
          <View style={styles.searchContainer}>
            <Ionicons name="search" size={20} color="#666" style={styles.searchIcon} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search products..."
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            <TouchableOpacity 
              style={styles.filterButton}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons name="filter" size={20} color="#666" />
            </TouchableOpacity>
          </View>

          {/* Cart Icon */}
          <View style={styles.headerIcons}>
            <TouchableOpacity style={styles.iconButton}>
              <Ionicons name="cart-outline" size={24} color="#333" />
              {cartItems.length > 0 && (
                <View style={styles.cartBadge}>
                  <Text style={styles.cartBadgeText}>{cartItems.length}</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Categories */}
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          style={styles.categoriesContainer}
        >
          {categories.map((category) => (
            <TouchableOpacity
              key={category}
              style={[
                styles.categoryButton,
                selectedCategory === category && styles.categoryButtonActive
              ]}
              onPress={() => setSelectedCategory(category)}
            >
              <Text style={[
                styles.categoryText,
                selectedCategory === category && styles.categoryTextActive
              ]}>
                {category}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Products grid */}
      <FlatList
        data={sortedProducts}
        renderItem={({ item }) => <ProductCard product={item} />}
        keyExtractor={item => item.id.toString()}
        numColumns={2}
        contentContainerStyle={styles.productsGrid}
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Filter & Sort</Text>
              <TouchableOpacity onPress={() => setShowFilters(false)}>
                <Ionicons name="close" size={24} color="#333" />
              </TouchableOpacity>
            </View>
            
            <Text style={styles.filterSectionTitle}>Sort By</Text>
            {['popular', 'price-low', 'price-high', 'rating'].map((option) => (
              <TouchableOpacity
                key={option}
                style={styles.filterOption}
                onPress={() => {
                  setSortBy(option);
                  setShowFilters(false);
                }}
              >
                <Text style={styles.filterOptionText}>
                  {option === 'popular' && 'Most Popular'}
                  {option === 'price-low' && 'Price: Low to High'}
                  {option === 'price-high' && 'Price: High to Low'}
                  {option === 'rating' && 'Highest Rated'}
                </Text>
                {sortBy === option && (
                  <Ionicons name="checkmark" size={20} color="#2c5aa0" />
                )}
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: '#f8f8f8', 
  },
  header: {
    backgroundColor: '#fff',
    padding: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerIcons: {
    flexDirection: 'row',
  },
  iconButton: {
    marginLeft: 16,
    position: 'relative',
  },
  cartBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF4444',
    borderRadius: 10,
    width: 18,
    height: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cartBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 10,
    paddingHorizontal: 12,
    flex: 1,
    marginRight: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 10,
    fontSize: 16,
  },
  filterButton: {
    padding: 4,
  },
  categoriesContainer: {
    marginBottom: 8,
  },
  categoryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    marginRight: 8,
  },
  categoryButtonActive: {
    backgroundColor: '#2c5aa0',
  },
  categoryText: {
    fontSize: 14,
    color: '#666',
  },
  categoryTextActive: {
    color: '#fff',
    fontWeight: '600',
  },
  productsGrid: {
    padding: 8,
  },
  productCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    margin: 8,
    width: '46%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
    overflow: 'hidden',
  },
  discountContainer: {
    position: 'absolute',
    top: 8,
    left: 8,
    zIndex: 1,
    flexDirection: 'row',
  },
  discountBadge: {
    backgroundColor: '#FF4444',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginRight: 4,
  },
  secondDiscount: {
    backgroundColor: '#FF6B6B',
  },
  discountText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
  wishlistButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 20,
    padding: 4,
  },
  imageContainer: {
    width: '100%',
    height: 120,
    backgroundColor: '#f0f0f0',
  },
  productImage: {
    width: '100%',
    height: '100%',
  },
  productInfo: {
    padding: 12,
  },
  productTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
    color: '#333',
  },
  productSubtitle: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  ratingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  starsContainer: {
    flexDirection: 'row',
    marginRight: 4,
  },
  ratingText: {
    fontSize: 12,
    color: '#666',
  },
  sellerText: {
    fontSize: 11,
    color: '#888',
    marginBottom: 6,
  },
  featuresContainer: {
    marginBottom: 8,
  },
  featureText: {
    fontSize: 10,
    color: '#888',
    marginBottom: 2,
  },
  priceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  productPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#2c5aa0',
    marginRight: 8,
  },
  originalPrice: {
    fontSize: 12,
    color: '#999',
    textDecorationLine: 'line-through',
  },
  addToCartButton: {
    backgroundColor: '#2c5aa0',
    paddingVertical: 8,
    borderRadius: 6,
    alignItems: 'center',
  },
  addToCartText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
  modalContainer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    minHeight: 300,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  filterSectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#333',
  },
  filterOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  filterOptionText: {
    fontSize: 16,
    color: '#333',
  },
});